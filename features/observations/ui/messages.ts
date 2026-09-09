/**
 * User-facing wording for domain validation codes.
 *
 * The domain emits codes; the words live here. Spanish is the confirmed
 * language scope (docs/tech-stack.md §7.2). When `react-i18next` is introduced
 * (docs/tech-stack.md §7.1) this map becomes the translation resource and no
 * domain code changes.
 */
import type { ValidationCode, ValidationIssue } from '../domain/validation';

const ATTRIBUTE_LABELS: Record<string, string> = {
  brand: 'marca',
  model: 'modelo',
  modality: 'modalidad',
  installation_year: 'año de instalación',
  operational_status: 'estado operativo',
};

const MESSAGES: Record<
  ValidationCode,
  (params?: Record<string, string | number>) => string
> = {
  site_required: () => 'Selecciona el sitio donde se hizo la observación.',
  visit_date_required: () => 'Indica la fecha de la visita.',
  visit_date_malformed: () => 'Usa el formato AAAA-MM-DD, por ejemplo 2026-09-09.',
  visit_date_in_future: () => 'La fecha de la visita no puede ser futura.',
  identifying_attribute_required: () =>
    'Indica al menos la marca, el modelo o la modalidad del equipo.',
  quantity_not_positive: () => 'La cantidad debe ser mayor que cero.',
  quantity_not_integer: () => 'La cantidad debe ser un número entero.',
  years_of_use_negative: () => 'Los años de uso no pueden ser negativos.',
  years_of_use_not_integer: () => 'Los años de uso deben ser un número entero.',
  installation_year_out_of_range: (params) =>
    `El año de instalación debe estar entre ${params?.min} y ${params?.max}.`,
  installation_year_not_integer: () =>
    'El año de instalación debe ser un número entero.',
  confidence_without_value: (params) => {
    const attribute = String(params?.attribute ?? '');
    return `Indicaste una confianza para ${
      ATTRIBUTE_LABELS[attribute] ?? attribute
    } pero el campo está vacío.`;
  },
};

export function messageFor(issue: ValidationIssue): string {
  return MESSAGES[issue.code](issue.params);
}

/** Groups issues by field so each control can show its own message. */
export function issuesByField(
  issues: ValidationIssue[]
): Record<string, string> {
  const byField: Record<string, string> = {};
  for (const issue of issues) {
    // First issue per field wins: showing one actionable message is clearer
    // than stacking several under one input.
    if (byField[issue.field] === undefined) {
      byField[issue.field] = messageFor(issue);
    }
  }
  return byField;
}
