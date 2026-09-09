/**
 * Composition root.
 *
 * The single place where the database is wired to the repository
 * implementations. Feature code asks for ports and receives them already
 * built, so no screen or hook has to know which driver backs them
 * (CLAUDE.md §5).
 */
import { openDatabase } from '../database';
import { createMapDataRepository } from '../database/repositories/map-data-repository';
import { createMapRegionRepository } from '../database/repositories/map-region-repository';
import { createObservationRepository } from '../database/repositories/observation-repository';
import { createSiteRepository } from '../database/repositories/site-repository';
import { createUserRepository } from '../database/repositories/user-repository';
import type { UserRepository } from '../features/authentication/application/ports';
import type {
  MapDataRepository,
  MapRegionRepository,
} from '../features/maps/application/ports';
import type { ObservationRepository } from '../features/observations/application/ports';
import type { SiteRepository } from '../features/sites/application/ports';
import { newId } from './id';

export interface Repositories {
  observations: ObservationRepository;
  sites: SiteRepository;
  users: UserRepository;
  /** Business data shown on the map. */
  mapData: MapDataRepository;
  /** Local map cache state — deliberately not the same port as mapData. */
  mapRegions: MapRegionRepository;
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
      observations: createObservationRepository(db, newId),
      sites: createSiteRepository(db),
      users: createUserRepository(db),
      mapData: createMapDataRepository(db),
      mapRegions: createMapRegionRepository(db),
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
