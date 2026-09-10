/**
 * Dashboard metrics, computed from locally stored observations.
 *
 * Every rule here is a pure function over rows already read from SQLite. None
 * of it touches the network, and none of it looks at synchronization state:
 * an observation captured five minutes ago and never uploaded counts exactly
 * like one the server has confirmed (CLAUDE.md §6, docs/offline-sync.md §2).
 * Synchronization status is reported *beside* these numbers, never inside them
 * (docs/architecture.md §10).
 *
 * Why aggregation happens here and not in SQL: the thresholds below are
 * business rules, and `expo-sqlite` has no Node implementation, so anything
 * expressed as SQL cannot be tested off-device (see
 * `tests/database/migrations.test.ts`). Keeping the rules in a pure module
 * makes them testable in ordinary CI; the repository stays a plain read. The
 * trade-off is that the observation rows are aggregated in memory — fine for
 * one field device's dataset, and if a device ever holds enough rows for that
 * to hurt, the GROUP BYs can move into SQL without changing the port.
 *
 * What these numbers are *not*: a verified installed base. They aggregate
 * observations, which are field reports (docs/domain-model.md §5–§6). Until
 * duplicate detection exists, two colleagues reporting the same scanner are
 * two observations, and the UI must say "reported", not "installed".
 */
import type { ConfidenceLevel } from '../../../types/domain';

/**
 * One locally stored observation, reduced to the columns the metrics need.
 *
 * Deliberately not the full `Observation` entity: a dashboard that selects
 * `notes` would read the user's free text into memory for no reason
 * (CLAUDE.md §15).
 */
export interface ObservationFact {
  observationId: string;
  siteId: string;
  siteName: string;
  country: string | null;
  city: string | null;
  /** `YYYY-MM-DD`. */
  visitDate: string;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  modality: string | null;
  estimatedYearsOfUse: number | null;
  estimatedInstallationYear: number | null;
  overallConfidence: ConfidenceLevel | null;
}

/**
 * PROPOSED thresholds — pending confirmation.
 *
 * No document defines them: the challenge brief asks for "customers with
 * aging technology", "recently updated sites" and "data freshness" without
 * saying where each line falls. They are named constants in one place so the
 * business can move them without a code search.
 */
export const AGING_EQUIPMENT_YEARS = 10;
export const STALE_SITE_DAYS = 180;
export const RECENTLY_UPDATED_LIMIT = 5;

/**
 * Age buckets, in years. `null` upper bound means open-ended.
 *
 * PROPOSED, same as above. Five-year bands match how the brief writes ages
 * ("around 8–10 years old") and keep the bucket count readable on a phone.
 */
export const AGE_BUCKETS: ReadonlyArray<{
  key: string;
  min: number;
  max: number | null;
}> = [
  { key: '0-4', min: 0, max: 4 },
  { key: '5-9', min: 5, max: 9 },
  { key: '10-14', min: 10, max: 14 },
  { key: '15+', min: 15, max: null },
];

/** The key used for equipment whose age nothing in the record establishes. */
export const UNKNOWN_AGE_BUCKET = 'unknown';

/**
 * Fields whose absence makes an observation incomplete
 * ("customers with incomplete information").
 *
 * PROPOSED. `model` is included even though it is optional for capture
 * (docs/ai-agent.md §4 lists it, `CAPTURE_FIELD_SPECS` does not require it):
 * an observation without a model is still valuable, which is why capture
 * accepts it, but it is also exactly the gap a follow-up visit should close.
 * "Incomplete" here means "worth going back for", not "invalid".
 */
export const COMPLETENESS_FIELDS = [
  'brand',
  'model',
  'modality',
  'quantity',
  'age',
] as const;
export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

/**
 * How many physical units an observation reports.
 *
 * An unknown quantity counts as one: it is one real equipment record whose
 * size is unclear, and counting it as zero would understate what the field
 * user actually saw. Same rule the map uses
 * (`database/repositories/map-data-repository.ts`), deliberately — the two
 * screens must not disagree about how many units a site has.
 */
export function unitsOf(fact: ObservationFact): number {
  if (fact.quantity === null || !Number.isFinite(fact.quantity)) return 1;
  return Math.max(1, Math.trunc(fact.quantity));
}

/**
 * Estimated age in years, or null when nothing in the record establishes one.
 *
 * `estimated_years_of_use` wins over the installation year because it is what
 * the user was asked directly; the installation year is only a way to derive
 * the same fact when they answered that instead. Neither is invented: an
 * observation with neither returns null and lands in the `unknown` bucket
 * rather than being silently treated as new (docs/ai-agent.md §5).
 */
export function estimatedAge(
  fact: ObservationFact,
  referenceYear: number
): number | null {
  if (fact.estimatedYearsOfUse !== null) {
    return Math.max(0, fact.estimatedYearsOfUse);
  }
  if (fact.estimatedInstallationYear !== null) {
    return Math.max(0, referenceYear - fact.estimatedInstallationYear);
  }
  return null;
}

/** The bucket an age falls in, or `unknown` when there is no age. */
export function ageBucketFor(age: number | null): string {
  if (age === null) return UNKNOWN_AGE_BUCKET;
  const bucket = AGE_BUCKETS.find(
    (candidate) =>
      age >= candidate.min && (candidate.max === null || age <= candidate.max)
  );
  return bucket?.key ?? UNKNOWN_AGE_BUCKET;
}

/** Which of the completeness fields this observation is missing. */
export function missingFields(
  fact: ObservationFact,
  referenceYear: number
): CompletenessField[] {
  const missing: CompletenessField[] = [];
  if (isBlank(fact.brand)) missing.push('brand');
  if (isBlank(fact.model)) missing.push('model');
  if (isBlank(fact.modality)) missing.push('modality');
  if (fact.quantity === null) missing.push('quantity');
  if (estimatedAge(fact, referenceYear) === null) missing.push('age');
  return missing;
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

/**
 * Whole days between two `YYYY-MM-DD` dates.
 *
 * Parsed as UTC midnight, matching the timestamp convention in
 * docs/database.md §17.1, so the result does not shift when the device
 * changes timezone between a visit and looking at the dashboard.
 */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** A count of observations and reported units under one key. */
export interface CategoryCount {
  /** Null when the observations did not record the value. */
  key: string | null;
  observations: number;
  units: number;
}

export interface AgeBucketCount {
  bucket: string;
  observations: number;
  units: number;
}

export interface SiteMetrics {
  siteId: string;
  name: string;
  country: string | null;
  city: string | null;
  observations: number;
  reportedUnits: number;
  /** Most recent visit date recorded for this site, `YYYY-MM-DD`. */
  lastVisitDate: string;
  daysSinceLastVisit: number;
  modalities: string[];
  /** Oldest known equipment age at this site, or null when none is known. */
  oldestEquipmentAge: number | null;
  /** Observations here missing at least one completeness field. */
  incompleteObservations: number;
}

export interface ConfidenceBreakdown {
  high: number;
  medium: number;
  low: number;
  /** Observations with no overall confidence derived. Not the same as low. */
  unrated: number;
}

export interface DashboardMetrics {
  totals: {
    sites: number;
    observations: number;
    reportedUnits: number;
    modalities: number;
    brands: number;
  };
  byModality: CategoryCount[];
  byCountry: CategoryCount[];
  byAge: AgeBucketCount[];
  byConfidence: ConfidenceBreakdown;
  completeness: {
    complete: number;
    incomplete: number;
    missingByField: Record<CompletenessField, number>;
  };
  sites: SiteMetrics[];
  /** Sites visited most recently — "recently updated customer sites". */
  recentlyUpdatedSites: SiteMetrics[];
  /** Not visited for `STALE_SITE_DAYS` — the freshness warning. */
  staleSites: SiteMetrics[];
  /** Equipment at or beyond `AGING_EQUIPMENT_YEARS` — refresh opportunities. */
  agingSites: SiteMetrics[];
}

interface CategoryAccumulator {
  observations: number;
  units: number;
}

function bump(
  into: Map<string | null, CategoryAccumulator>,
  key: string | null,
  units: number
): void {
  const current = into.get(key) ?? { observations: 0, units: 0 };
  current.observations += 1;
  current.units += units;
  into.set(key, current);
}

/**
 * Units first, then key, with the "not recorded" bucket last.
 *
 * Sorting by units puts the biggest part of the installed base at the top of
 * a phone screen, which is the only part likely to be read without scrolling.
 * The null bucket sorts last regardless of size: it is a data-quality signal,
 * not a modality.
 */
function toSortedCategories(
  accumulated: Map<string | null, CategoryAccumulator>
): CategoryCount[] {
  return [...accumulated.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => {
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      if (b.units !== a.units) return b.units - a.units;
      return a.key.localeCompare(b.key);
    });
}

function normalize(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Computes every dashboard metric from locally stored observations.
 *
 * `today` is injected rather than read from the clock, so freshness and age
 * are deterministic in tests and the caller controls the timezone the
 * comparison happens in — the same reason `validateObservationDraft` takes it.
 */
export function computeDashboardMetrics(
  facts: ObservationFact[],
  today: string
): DashboardMetrics {
  const referenceYear = Number(today.slice(0, 4));

  const modalities = new Map<string | null, CategoryAccumulator>();
  const countries = new Map<string | null, CategoryAccumulator>();
  const ages = new Map<string, CategoryAccumulator>();
  const brands = new Set<string>();
  const sites = new Map<string, SiteMetrics & { modalitySet: Set<string> }>();

  const byConfidence: ConfidenceBreakdown = {
    high: 0,
    medium: 0,
    low: 0,
    unrated: 0,
  };
  const missingByField = Object.fromEntries(
    COMPLETENESS_FIELDS.map((field) => [field, 0])
  ) as Record<CompletenessField, number>;

  let reportedUnits = 0;
  let incomplete = 0;

  for (const fact of facts) {
    const units = unitsOf(fact);
    reportedUnits += units;

    const modality = normalize(fact.modality);
    const country = normalize(fact.country);
    const brand = normalize(fact.brand);

    bump(modalities, modality, units);
    bump(countries, country, units);
    if (brand !== null) brands.add(brand);

    const age = estimatedAge(fact, referenceYear);
    const bucket = ageBucketFor(age);
    const ageCount = ages.get(bucket) ?? { observations: 0, units: 0 };
    ageCount.observations += 1;
    ageCount.units += units;
    ages.set(bucket, ageCount);

    if (fact.overallConfidence === null) byConfidence.unrated += 1;
    else byConfidence[fact.overallConfidence] += 1;

    const missing = missingFields(fact, referenceYear);
    for (const field of missing) missingByField[field] += 1;
    if (missing.length > 0) incomplete += 1;

    const existing = sites.get(fact.siteId);
    if (existing === undefined) {
      sites.set(fact.siteId, {
        siteId: fact.siteId,
        name: fact.siteName,
        country,
        city: normalize(fact.city),
        observations: 1,
        reportedUnits: units,
        lastVisitDate: fact.visitDate,
        daysSinceLastVisit: daysBetween(fact.visitDate, today),
        modalities: [],
        modalitySet: new Set(modality === null ? [] : [modality]),
        oldestEquipmentAge: age,
        incompleteObservations: missing.length > 0 ? 1 : 0,
      });
    } else {
      existing.observations += 1;
      existing.reportedUnits += units;
      if (fact.visitDate > existing.lastVisitDate) {
        // Lexicographic comparison is valid for zero-padded ISO dates.
        existing.lastVisitDate = fact.visitDate;
        existing.daysSinceLastVisit = daysBetween(fact.visitDate, today);
      }
      if (modality !== null) existing.modalitySet.add(modality);
      if (age !== null) {
        existing.oldestEquipmentAge =
          existing.oldestEquipmentAge === null
            ? age
            : Math.max(existing.oldestEquipmentAge, age);
      }
      if (missing.length > 0) existing.incompleteObservations += 1;
    }
  }

  const siteMetrics: SiteMetrics[] = [...sites.values()]
    .map(({ modalitySet, ...site }) => ({
      ...site,
      modalities: [...modalitySet].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const byAge: AgeBucketCount[] = [
    ...AGE_BUCKETS.map((bucket) => bucket.key),
    UNKNOWN_AGE_BUCKET,
  ]
    // Every bucket is reported, including empty ones: "no equipment aged 15+"
    // is information, and a disappearing bucket reads as missing data.
    .map((bucket) => ({
      bucket,
      observations: ages.get(bucket)?.observations ?? 0,
      units: ages.get(bucket)?.units ?? 0,
    }));

  return {
    totals: {
      sites: siteMetrics.length,
      observations: facts.length,
      reportedUnits,
      modalities: [...modalities.keys()].filter((key) => key !== null).length,
      brands: brands.size,
    },
    byModality: toSortedCategories(modalities),
    byCountry: toSortedCategories(countries),
    byAge,
    byConfidence,
    completeness: {
      complete: facts.length - incomplete,
      incomplete,
      missingByField,
    },
    sites: siteMetrics,
    recentlyUpdatedSites: [...siteMetrics]
      .sort((a, b) => b.lastVisitDate.localeCompare(a.lastVisitDate))
      .slice(0, RECENTLY_UPDATED_LIMIT),
    staleSites: siteMetrics
      .filter((site) => site.daysSinceLastVisit >= STALE_SITE_DAYS)
      .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit),
    agingSites: siteMetrics
      .filter(
        (site) =>
          site.oldestEquipmentAge !== null &&
          site.oldestEquipmentAge >= AGING_EQUIPMENT_YEARS
      )
      .sort((a, b) => (b.oldestEquipmentAge ?? 0) - (a.oldestEquipmentAge ?? 0)),
  };
}
