/**
 * In-memory selection of one site to summarize on the dashboard.
 *
 * The map screen sets this (its "Mostrar resumen del cliente en el tablero"
 * button); the dashboard reads it. Same pattern as
 * `services/sync/session.ts`: plain module state rather than React state or
 * navigation params, so the two screens do not need to share a component
 * tree. It lives here rather than inside `features/dashboard/` or
 * `features/maps/` because both features depend on it and neither should
 * depend on the other (CLAUDE.md §5).
 *
 * Not persisted and not part of the domain model — a transient UI choice,
 * not local data (CLAUDE.md §8: this adds no field to Site or Observation).
 */
export interface DashboardScopeSite {
  siteId: string;
  name: string;
  city: string | null;
  country: string | null;
}

let scopedSite: DashboardScopeSite | null = null;
const listeners = new Set<() => void>();

export function setDashboardScopeSite(site: DashboardScopeSite | null): void {
  scopedSite = site;
  for (const listener of listeners) listener();
}

export function getDashboardScopeSite(): DashboardScopeSite | null {
  return scopedSite;
}

/**
 * Notifies a mounted dashboard the moment the scope changes, so it reacts
 * even though expo-router's tab navigator keeps screens mounted across tab
 * switches (a plain mount-time read would miss a change made while the
 * dashboard tab was already alive in the background).
 */
export function subscribeDashboardScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
