/**
 * User-facing wording for the observation-history screen.
 *
 * Follows the same convention as messages.ts: the domain/database emit
 * values, the words live here (Spanish, docs/tech-stack.md §7.2).
 */
import type { CaptureSource, ConfidenceLevel } from '../../../types/domain';

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const CAPTURE_SOURCE_LABELS: Record<CaptureSource, string> = {
  voice: 'Voz',
  text: 'Texto',
  image: 'Foto',
};

export const NOT_RECORDED = '—';

export function confidenceLabel(value: ConfidenceLevel | null): string {
  return value ? CONFIDENCE_LABELS[value] : NOT_RECORDED;
}

export function captureSourceLabel(value: CaptureSource | null): string {
  return value ? CAPTURE_SOURCE_LABELS[value] : NOT_RECORDED;
}

/** "2026-08-18" -> "18/08/2026". `visit_date` is always `YYYY-MM-DD` (docs/database.md §17.1). */
export function formatVisitDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

/** "2026-09-10T12:00:00.000Z" -> "10/09/2026". Timestamps are ISO-8601 UTC (docs/database.md §6). */
export function formatTimestamp(isoTimestamp: string): string {
  return formatVisitDate(isoTimestamp.slice(0, 10));
}
