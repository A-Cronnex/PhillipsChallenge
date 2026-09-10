import type { AiRuntime } from './ports';
import type { ConversationState } from '../domain/conversation';
import { normalizeExtraction, parseExtraction, type ExtractedValue, type AgentIssue } from '../domain/extraction';
import { validateExtractedValues } from '../domain/value-rules';
import { capConfidenceByStatus } from '../domain/confidence';
import { visionTargetsFor } from '../domain/vision-flow';
import { CAPTURE_FIELD_SPECS } from '../domain/fields';

export interface NameplateProposal {
  imagePath: string;
  values: ExtractedValue[];
  rejected: AgentIssue[];
}

/** A proposal is deliberately outside ConversationState until human confirmation. */
export async function analyzeNameplate(runtime: AiRuntime, conversation: ConversationState, imagePath: string): Promise<NameplateProposal> {
  const targets = visionTargetsFor(conversation);
  const parsed = parseExtraction(await runtime.extractFromImage({ imagePath, targetFields: targets, language: 'es' }));
  if (!parsed.ok) throw new Error('No se pudieron interpretar los datos de la imagen. Intenta con otra foto.');
  if (parsed.extraction.nameplate === 'not_detected') throw new Error('No se detectó una placa de identificación. Acerca la cámara a la placa o continúa por voz.');
  if (parsed.extraction.nameplate !== 'detected') throw new Error('No se pudo confirmar que la imagen sea una placa. Prueba una foto más clara o continúa por voz.');
  const normalized = normalizeExtraction(parsed.extraction);
  const checked = validateExtractedValues(normalized.values);
  const seen = new Set<string>();
  const rejected: AgentIssue[] = [...parsed.rejected, ...checked.issues];
  const values = checked.values.filter(value => {
    if (value.value === null) return false;
    if (!targets.includes(value.field) || seen.has(value.field)) {
      rejected.push({ path: value.field, code: 'unrequested_or_duplicate_field' });
      return false;
    }
    seen.add(value.field);
    return true;
  }).map(value => ({ ...value, confidence: capConfidenceByStatus(value.status, value.confidence) ?? value.confidence }));
  if (!values.some(value => value.value !== null)) throw new Error('La placa está presente, pero sus datos no se pueden leer. Mejora la luz o continúa por voz.');
  return { imagePath, values, rejected };
}

/** Validate edits with the same domain rules as every other capture path. */
export function validateNameplateEdits(proposal: NameplateProposal, edits: ExtractedValue[]): ExtractedValue[] {
  const parsed = parseExtraction({ values: edits });
  if (!parsed.ok || parsed.rejected.length) throw new Error('Revisa los valores y la confianza de los campos.');
  const seen = new Set<string>();
  const values = parsed.extraction.values.map(value => {
    const original = proposal.values.find(item => item.field === value.field);
    if (!original || !CAPTURE_FIELD_SPECS[value.field].visionReadable || seen.has(value.field)) throw new Error('La revisión contiene campos no solicitados.');
    seen.add(value.field);
    const changed = value.value !== original.value;
    const status = value.value === null ? 'unknown' : changed ? 'reported' : original.status;
    return { ...value, status, confidence: capConfidenceByStatus(status, value.confidence) ?? value.confidence };
  });
  const checked = validateExtractedValues(values);
  if (checked.issues.length) throw new Error('Hay valores fuera de rango. Revisa los campos antes de enviar.');
  if (!checked.values.some(value => value.value !== null)) throw new Error('Conserva al menos un dato legible o cancela la revisión.');
  return checked.values;
}
