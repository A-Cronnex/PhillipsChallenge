/**
 * One-time demo data bootstrap: the two dummy-dataset sites (with their
 * equipment) and the four predefined map regions, so the Dashboard, Capture
 * and Map screens have something to show without the user doing anything
 * first.
 *
 * Kept out of `lib/container.ts`: that module only wires repositories to the
 * database, and seeding is an application-level side effect, not part of
 * "open the database." Called from `LocalUserGate` once a local user exists
 * — both seed functions need a `created_by` user id.
 *
 * `seeded` makes this a no-op after the first successful run within the
 * process's lifetime; the seed functions themselves are also idempotent
 * against the database (site/region ids), so calling this again after a
 * failure, or on the next app launch, is safe.
 */
import { getRepositories } from './container';
import { newId } from './id';
import { seedDummyInstalledBase } from '../features/catalog/application/seed-dummy-installed-base';
import { seedPredefinedRegions } from '../features/maps/application/seed-predefined-regions';

let seeded = false;

export async function ensureDemoDataSeeded(): Promise<void> {
  if (seeded) return;

  try {
    const repositories = await getRepositories();
    const user = await repositories.users.getCurrentUser();
    // No local user yet — LocalUserGate is still in its setup step. Nothing
    // to attribute the seeded observations to; try again next time this is
    // called (e.g. after the gate re-renders as 'ready').
    if (!user) return;

    seeded = true;

    await seedDummyInstalledBase({
      catalog: repositories.catalog,
      observations: repositories.observations,
      userId: user.id,
      now: () => new Date(),
      newId,
    });
    await seedPredefinedRegions(repositories.mapRegions);
  } catch (error) {
    seeded = false;
    // Demo data failing to seed must not be mistaken for patient/business
    // data loss — nothing the user captured is at risk — but it is worth a
    // trace during development.
    console.warn(
      '[demo-seed] failed:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Test/teardown helper. */
export function resetDemoSeedState(): void {
  seeded = false;
}
