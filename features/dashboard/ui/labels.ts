/**
 * User-facing wording for the dashboard.
 *
 * The domain emits keys; the words live here, for the same reason validation
 * codes do (`features/observations/ui/messages.ts`). Spanish is the confirmed
 * scope (docs/tech-stack.md §7.2), and this map becomes the translation
 * resource when `react-i18next` is introduced (§7.1).
 */
import {
  AGING_EQUIPMENT_YEARS,
  STALE_SITE_DAYS,
  UNKNOWN_AGE_BUCKET,
  type CompletenessField,
} from '../domain/metrics';

/**
 * What to show for a category the observations did not record.
 *
 * Never blank and never omitted: "sin modalidad" is a data-quality fact the
 * user can act on, and a missing row would read as no equipment at all.
 */
export const NOT_RECORDED_LABEL = 'Sin registrar';

export function modalityLabel(key: string | null): string {
  return key ?? 'Modalidad sin registrar';
}

export function countryLabel(key: string | null): string {
  return key ?? 'País sin registrar';
}

export function ageBucketLabel(bucket: string): string {
  if (bucket === UNKNOWN_AGE_BUCKET) return 'Antigüedad desconocida';
  if (bucket.endsWith('+')) return `${bucket.slice(0, -1)} años o más`;
  return `${bucket.replace('-', ' a ')} años`;
}

export const CONFIDENCE_LABELS = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  unrated: 'Sin calificar',
} as const;

export const COMPLETENESS_LABELS: Record<CompletenessField, string> = {
  brand: 'Sin marca',
  model: 'Sin modelo',
  modality: 'Sin modalidad',
  quantity: 'Sin cantidad',
  age: 'Sin antigüedad',
};

export const AGING_SITES_CAPTION = `Sitios con equipos de ${AGING_EQUIPMENT_YEARS} años o más.`;
export const STALE_SITES_CAPTION = `Sitios sin visitar desde hace ${STALE_SITE_DAYS} días o más.`;

/** "hace 3 días", with the two cases a field user actually sees most. */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}
