/**
 * Seeds the two dummy-dataset sites this app's map/dashboard demo is built
 * around, from `Dummy_Installed_Base_Hackathon.xlsx` ("Dummy Installed
 * Base" sheet, rows for Panama City and Sao Paulo).
 *
 * The spreadsheet carries no coordinates — only country and city names — so
 * each site is placed at a random point within a small radius of its city's
 * known center. That is real business data (a real hospital name, real
 * equipment counts) with a synthesized position, not a fabricated site; the
 * map screen already labels every equipment marker as sharing its site's
 * coordinates (docs/maps.md §6), and a randomized-but-plausible point within
 * the city is consistent with that same approximation.
 *
 * Goes through the same ports real capture uses — `CatalogRepository` for
 * the site, `captureObservation` for each equipment row — so this data is
 * validated and queued for synchronization exactly like anything a field
 * user enters (CLAUDE.md §7). No SQL lives here.
 */
import { captureObservation } from '../../observations/application/capture-observation';
import type { ObservationDraft } from '../../observations/domain/observation';
import type { ObservationRepository } from '../../observations/application/ports';
import type { AttributeConfidenceSelection } from '../../observations/domain/observation';
import type { ConfidenceLevel } from '../../../types/domain';
import type { CatalogRepository, SiteDraft } from './ports';

interface DummyEquipmentRow {
  visitDate: string;
  modality: string;
  quantity: number;
  brand: string;
  model: string;
  approxAgeYears: number;
  estimatedInstallationYear: number;
  confidence: ConfidenceLevel;
  notes: string;
}

interface DummySite {
  name: string;
  city: string;
  country: string;
  /** Degrees. The random point is drawn from within this radius of the center. */
  centerLatitude: number;
  centerLongitude: number;
  radiusDegrees: number;
  equipment: DummyEquipmentRow[];
}

/**
 * From the "Dummy Installed Base" sheet — observation ids 1–2 (Panama City)
 * and 3–4 (Sao Paulo). Campinas (ids 5–6) is a separate city and was not
 * asked for; Mexico/Chile/Argentina/etc. rows belong to countries this pass
 * does not cover.
 */
export const DUMMY_SITES: DummySite[] = [
  {
    name: 'Hospital DemoCare Pacific',
    city: 'Panama City',
    country: 'Panama',
    centerLatitude: 8.9824,
    centerLongitude: -79.5199,
    radiusDegrees: 0.04,
    equipment: [
      {
        visitDate: '2026-08-18',
        modality: 'MR',
        quantity: 2,
        brand: 'NovaMed',
        model: 'NM-MR 700',
        approxAgeYears: 7,
        estimatedInstallationYear: 2019,
        confidence: 'high',
        notes: 'Two MR systems observed in imaging area.',
      },
      {
        visitDate: '2026-08-18',
        modality: 'CT',
        quantity: 1,
        brand: 'Aurelia Health',
        model: 'AH-CT 320',
        approxAgeYears: 5,
        estimatedInstallationYear: 2021,
        confidence: 'high',
        notes: 'Single CT system observed.',
      },
    ],
  },
  {
    name: 'Hospital DemoCare Horizon',
    city: 'Sao Paulo',
    country: 'Brazil',
    centerLatitude: -23.5505,
    centerLongitude: -46.6333,
    radiusDegrees: 0.05,
    equipment: [
      {
        visitDate: '2026-08-16',
        modality: 'MR',
        quantity: 3,
        brand: 'BluePeak Medical',
        model: 'BP-MR 500',
        approxAgeYears: 9,
        estimatedInstallationYear: 2017,
        confidence: 'medium',
        notes: 'Aggregate row for older systems.',
      },
      {
        visitDate: '2026-08-16',
        modality: 'MR',
        quantity: 1,
        brand: 'BluePeak Medical',
        model: 'BP-MR 900',
        approxAgeYears: 3,
        estimatedInstallationYear: 2023,
        confidence: 'medium',
        notes: 'Newer MR system.',
      },
    ],
  },
];

export interface SeedDummyInstalledBaseDeps {
  catalog: CatalogRepository;
  observations: ObservationRepository;
  userId: string;
  now: () => Date;
  newId: () => string;
  /** Test seam; defaults to `Math.random`. */
  random?: () => number;
}

/** A uniformly-distributed point within `radiusDegrees` of the center — not just within the bounding box, which would bias corners. */
function randomPointNear(
  centerLatitude: number,
  centerLongitude: number,
  radiusDegrees: number,
  random: () => number
): { latitude: number; longitude: number } {
  const angle = random() * 2 * Math.PI;
  const radius = radiusDegrees * Math.sqrt(random());
  return {
    latitude: centerLatitude + radius * Math.sin(angle),
    longitude: centerLongitude + radius * Math.cos(angle),
  };
}

function toAttributeConfidence(level: ConfidenceLevel): AttributeConfidenceSelection {
  return { brand: level, model: level, modality: level, installation_year: level };
}

/**
 * Idempotent: `createSite` rejects a duplicate (name, city, country), which
 * this treats as "already seeded" and skips — safe to call on every app
 * start (`lib/demo-seed.ts`).
 */
export async function seedDummyInstalledBase(deps: SeedDummyInstalledBaseDeps): Promise<void> {
  const random = deps.random ?? Math.random;

  for (const site of DUMMY_SITES) {
    const point = randomPointNear(site.centerLatitude, site.centerLongitude, site.radiusDegrees, random);
    const draft: SiteDraft = {
      name: site.name,
      city: site.city,
      country: site.country,
      address: '',
      latitude: point.latitude,
      longitude: point.longitude,
    };

    let siteId: string;
    try {
      siteId = await deps.catalog.createSite(draft);
    } catch {
      // Already seeded (or a real site happens to share this exact
      // name/city/country) — either way, do not create a second one or
      // attribute more equipment to it.
      continue;
    }

    for (const row of site.equipment) {
      const observationDraft: ObservationDraft = {
        siteId,
        equipmentId: null,
        visitDate: row.visitDate,
        quantity: row.quantity,
        brand: row.brand,
        model: row.model,
        modality: row.modality,
        estimatedYearsOfUse: row.approxAgeYears,
        estimatedInstallationYear: row.estimatedInstallationYear,
        operationalStatus: null,
        notes: row.notes,
        attributeConfidence: toAttributeConfidence(row.confidence),
      };

      await captureObservation(observationDraft, deps.userId, {
        repository: deps.observations,
        now: deps.now,
        newId: deps.newId,
      });
    }
  }
}
