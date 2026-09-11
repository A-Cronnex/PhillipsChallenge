import { getSyncToken } from '../services/sync/session';
import { createConversationRepository } from '../database/repositories/conversation-repository';
import type { ConversationRepository } from '../features/conversations/application/ports';
/**
 * Composition root.
 *
 * The single place where the database is wired to the repository
 * implementations. Feature code asks for ports and receives them already
 * built, so no screen or hook has to know which driver backs them
 * (CLAUDE.md §5).
 */
import { openDatabase } from '../database';
import {
  createDashboardRepository,
  createSyncStateRepository,
} from '../database/repositories/dashboard-repository';
import { createMapDataRepository } from '../database/repositories/map-data-repository';
import { createMapRegionRepository } from '../database/repositories/map-region-repository';
import { createObservationRepository } from '../database/repositories/observation-repository';
import { createSettingsRepository } from '../database/repositories/settings-repository';
import { createSiteRepository } from '../database/repositories/site-repository';
import { createSyncRepository } from '../database/repositories/sync-repository';
import { createSyncDownloadRepository } from '../database/repositories/sync-download-repository';
import { createUserRepository } from '../database/repositories/user-repository';
import type { UserRepository } from '../features/authentication/application/ports';
import type {
  DashboardRepository,
  SyncStateRepository,
} from '../features/dashboard/application/ports';
import type {
  MapDataRepository,
  MapRegionRepository,
} from '../features/maps/application/ports';
import type { ObservationRepository } from '../features/observations/application/ports';
import type { SiteRepository } from '../features/sites/application/ports';
import type {
  DeviceIdentityRepository,
  SyncQueueRepository,
  SyncDownloadRepository,
  SyncTransport,
} from '../features/synchronization/application/ports';
import { createHttpSyncTransport } from '../services/sync/http-transport';
import { isSyncConfigured } from '../services/sync/config';
import { createCatalogRepository } from '../database/repositories/catalog-repository';
import type { CatalogRepository } from '../features/catalog/application/ports';
import { newId } from './id';

export interface Repositories {
  catalog: CatalogRepository;
  conversations: ConversationRepository;
  observations: ObservationRepository;
  sites: SiteRepository;
  users: UserRepository;
  /** Business data shown on the map. */
  mapData: MapDataRepository;
  /** Local map cache state — deliberately not the same port as mapData. */
  mapRegions: MapRegionRepository;
  /** Aggregated business data for the dashboard. */
  dashboard: DashboardRepository;
  /** Synchronization state counts — shown by the dashboard, not owned by it. */
  syncState: SyncStateRepository;
  /** The upload queue. Reads and writes `sync_records` only. */
  syncQueue: SyncQueueRepository;
  syncDownloads: SyncDownloadRepository;
  /** This installation's stable device id. */
  deviceIdentity: DeviceIdentityRepository;
  /**
   * `null` while no sync server is configured (services/sync/config.ts).
   *
   * Deliberately nullable rather than a stub that always fails: a stub would
   * mark every queued record `failed`, when the truth is that there is nothing
   * wrong and nowhere to send them.
   */
  syncTransport: SyncTransport | null;
}

let repositories: Repositories | null = null;
let building: Promise<Repositories> | null = null;

/**
 * Opens (and migrates) the local database on first call and returns the
 * repositories built on it. Concurrent callers share one initialisation.
 */
export async function getRepositories(): Promise<Repositories> {
  if (repositories) return repositories;
  if (building) return building;

  building = (async () => {
    const db = await openDatabase();
    const built: Repositories = {
      catalog: createCatalogRepository(db, newId),
      conversations: createConversationRepository(db, newId),
      observations: createObservationRepository(db, newId),
      sites: createSiteRepository(db),
      users: createUserRepository(db),
      mapData: createMapDataRepository(db),
      mapRegions: createMapRegionRepository(db),
      dashboard: createDashboardRepository(db),
      syncState: createSyncStateRepository(db),
      syncQueue: createSyncRepository(db),
      syncDownloads: createSyncDownloadRepository(db, newId),
      deviceIdentity: createSettingsRepository(db, newId),
      syncTransport: isSyncConfigured() ? createHttpSyncTransport({ authHeaders: async () => {
        const token = getSyncToken();
        if (!token) throw new Error('Introduce la credencial de sincronización.');
        return { authorization: `Bearer ${token}`,
          'x-device-id': await built.deviceIdentity.getOrCreateDeviceId(new Date().toISOString()) };
      } }) : null,
    };
    repositories = built;
    return built;
  })();

  try {
    return await building;
  } finally {
    building = null;
  }
}

/** Test/teardown helper: drops the cached wiring. */
export function resetRepositories(): void {
  repositories = null;
  building = null;
}
