import type { AiRuntime } from './ports';
import type { ConversationState } from '../domain/conversation';
import { normalizeExtraction, parseExtraction, type ExtractedValue, type AgentIssue } from '../domain/extraction';
import { validateExtractedValues } from '../domain/value-rules';
import { capConfidenceByStatus } from '../domain/confidence';
import { visionTargetsFor } from '../domain/vision-flow';
import { CAPTURE_FIELD_SPECS, labelOf, type CaptureField } from '../domain/fields';

export interface NameplateProposal {
  imagePath: string;
  values: ExtractedValue[];
  rejected: AgentIssue[];
  /** VisionPsy's own assessment. Only `detected` photos reach a proposal. */
  nameplate: 'detected';
  /**
   * Target fields the model was asked to read but returned as null/unknown,
   * or whose value the application dropped. Shown in the review as empty,
   * editable rows so the user can type them instead of hitting a dead end
   * when the model reads a plate but not its contents (observed on device:
   * VisionPsy-Nano is unreliable at this).
   */
  unreadable: CaptureField[];
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
  const unreadable = targets.filter(field => !seen.has(field));

  if (__DEV__) {
    console.log('[vision] nameplate review', JSON.stringify({
      imagePath, targets,
      read: values.map(v => ({ field: v.field, value: v.value, status: v.status, confidence: v.confidence })),
      unreadable, rejected,
    }, null, 2));
  }

  // Note: a `detected` plate whose fields are all unreadable is NOT rejected
  // here. The user still reaches the review screen (with empty rows) and can
  // type what they see or take another photo — better than a dead-end error.
  return { imagePath, values, rejected, nameplate: 'detected', unreadable };
}

/** Validate edits with the same domain rules as every other capture path. */
export function validateNameplateEdits(proposal: NameplateProposal, edits: ExtractedValue[]): ExtractedValue[] {
  const parsed = parseExtraction({ values: edits });
  if (!parsed.ok || parsed.rejected.length) throw new Error('Revisa los valores y la confianza de los campos.');
  const seen = new Set<string>();
  const editable = new Set<CaptureField>([...proposal.values.map(v => v.field), ...proposal.unreadable]);
  const values = parsed.extraction.values.map(value => {
    const original = proposal.values.find(item => item.field === value.field);
    if (!editable.has(value.field) || !CAPTURE_FIELD_SPECS[value.field].visionReadable || seen.has(value.field)) throw new Error('La revisión contiene campos no solicitados.');
    seen.add(value.field);
    const changed = value.value !== (original?.value ?? null);
    const status = value.value === null ? 'unknown' : changed ? 'reported' : original?.status ?? 'reported';
    return { ...value, status, confidence: capConfidenceByStatus(status, value.confidence) ?? value.confidence };
  });
  const checked = validateExtractedValues(values);
  if (checked.issues.length) throw new Error('Hay valores fuera de rango. Revisa los campos antes de enviar.');
  if (!checked.values.some(value => value.value !== null)) throw new Error('Escribe al menos un dato de la placa o cancela la revisión.');
  return checked.values;
}

/** Human-readable list of the fields the model could not read, for the review UI. */
export function describeUnreadable(fields: CaptureField[]): string {
  return fields.map(labelOf).join(', ');
}
