/**
 * Application service for the observation-history screen.
 *
 * Mirrors features/maps/application/load-map-data.ts's shape: load what the
 * screen needs in one place, report failure as a value instead of throwing,
 * and depend only on ports — never on `expo-sqlite` or React.
 */
import type { SiteRepository, SiteSummary } from '../../sites/application/ports';
import type { ObservationRepository } from './ports';
import type { ObservationRecord } from '../domain/observation-record';

export interface ObservationHistoryData {
  site: SiteSummary;
  observations: ObservationRecord[];
}

export type LoadObservationHistoryOutcome =
  | { status: 'loaded'; data: ObservationHistoryData }
  | { status: 'site_not_found' }
  | { status: 'failed'; reason: string };

export interface LoadObservationHistoryDeps {
  sites: SiteRepository;
  observations: ObservationRepository;
}

export async function loadObservationHistory(
  siteId: string,
  deps: LoadObservationHistoryDeps
): Promise<LoadObservationHistoryOutcome> {
  try {
    const site = await deps.sites.getSite(siteId);
    if (!site) return { status: 'site_not_found' };

    const observations = await deps.observations.listBySite(siteId);
    return { status: 'loaded', data: { site, observations } };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
