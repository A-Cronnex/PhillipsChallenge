# Dashboard — Implementation Notes

Local analytics over what the device has captured. Companion to
`docs/architecture.md` §4 (dashboard queries belong to the application layer)
and `docs/offline-sync.md` §2 ("view locally available dashboard data").

There was no dashboard specification in `docs/`; the metric list comes from the
challenge brief's *Dashboard & Analytics* section. Every threshold this
required is flagged as proposed in §4 below.

## 1. The Offline Rule This Screen Exists To Honour

Every number is computed on the device from SQLite rows. There is no network
call anywhere in the path, and **no metric is filtered by synchronization
state**: an observation captured five minutes ago and never uploaded counts
exactly like one the server has confirmed.

That is not a detail. No backend exists yet (`docs/tech-stack.md` §5), so every
local record is `pending` forever — a dashboard that counted only synchronized
rows would be permanently empty on a device that captured all day.

It is enforced structurally, not by discipline: `DashboardRepository` reads
`observations` and `sites` and cannot see `sync_records` at all. The
synchronization counts come from a separate port
(`SyncStateRepository`) and are rendered in their own section, because the
dashboard may display synchronization status but must not own it
(`docs/architecture.md` §10). `tests/features/dashboard/load-dashboard.test.ts`
asserts that the same observations produce identical metrics whether they are
`pending` or `synchronized`.

## 2. Why Observations And Not Equipment

The metrics aggregate `observations`, not `equipment`.

`equipment` rows are created by synchronization or by duplicate detection.
Neither exists (`docs/ai-agent-implementation.md` §8.1), so on a real device
that table is empty while `observations` fills up with every capture. The map
reads `equipment` and the dashboard reads `observations`; that is a real
difference between the two screens today, and it resolves itself when
observations start being promoted into equipment records.

**Consequence, stated on the screen itself:** these are field reports, not a
verified installed base. Until duplicate detection exists, two colleagues
reporting the same scanner are two observations and two counts. The UI says
"unidades reportadas" and "observaciones", never "instalado".

## 3. Where The Rules Live

```
app/(tabs)/dashboard/index.tsx        route
features/dashboard/ui/                DashboardScreen, useDashboard, labels
features/dashboard/application/       load-dashboard, ports
features/dashboard/domain/metrics.ts  every metric rule, pure
        ↓ DashboardRepository / SyncStateRepository (interfaces)
database/repositories/dashboard-repository.ts   SQL
```

Aggregation happens in the domain module, not in SQL. `expo-sqlite` has no Node
implementation — it binds to native SQLite — so anything expressed as a
`GROUP BY` cannot be tested off-device (same limitation as
`tests/database/migrations.test.ts`). Keeping the rules pure makes all of them
testable in ordinary CI, at the cost of aggregating the observation rows in
memory. That is fine for one field device's dataset; if a device ever holds
enough rows for it to hurt, the grouping can move into SQL without changing the
port.

The repository deliberately does not select `notes`: free text has no place in
an aggregate, and reading it here would pull the user's own words about a
hospital into memory for nothing (CLAUDE.md §15).

## 4. Proposed Thresholds — Pending Confirmation

No document defines these. They are named constants in
`features/dashboard/domain/metrics.ts`, changeable in one line each.

| Constant | Value | What it decides |
|---|---|---|
| `AGING_EQUIPMENT_YEARS` | 10 | When a site appears under "oportunidades de renovación" |
| `STALE_SITE_DAYS` | 180 | When a site's information counts as unrefreshed |
| `RECENTLY_UPDATED_LIMIT` | 5 | How many recent sites the screen lists |
| `AGE_BUCKETS` | 0–4, 5–9, 10–14, 15+ | Age bands; five-year bands match how the brief writes ages ("around 8–10 years old") |
| `COMPLETENESS_FIELDS` | brand, model, modality, quantity, age | What makes an observation "incomplete" |

Two judgements inside those rules worth disagreeing with explicitly:

- **A site's age is its *oldest* known equipment**, not the average. Averaging
  would hide a fourteen-year-old scanner behind two new monitors, and the old
  scanner is the reason to visit.
- **`model` counts toward incompleteness** even though capture does not require
  it. "Incomplete" here means "worth going back for", not "invalid" — an
  observation without a model is still valuable, which is why capture accepts
  it.

## 5. Rules Shared With Other Screens

- **Unknown quantity counts as one unit.** One real equipment record whose size
  is unclear; counting it as zero would understate what the field user saw.
  Identical to the rule in `database/repositories/map-data-repository.ts` —
  deliberately, so the map and the dashboard cannot disagree about how many
  units a site has.
- **Nothing is invented.** An observation with neither `estimated_years_of_use`
  nor `estimated_installation_year` lands in an explicit `unknown` age bucket
  rather than being treated as new (`docs/ai-agent.md` §5).
- **"Not recorded" is shown, never hidden.** Equipment with no modality gets
  its own row, sorted last. A missing row would read as "no equipment"; the
  row reads as "we don't know", which is a data-quality fact a user can act on.
- **Unrated is not low confidence.** An observation with no
  `overall_confidence` is counted separately, because the manual capture flow
  derives no overall value when no attribute carries a confidence
  (`features/observations/domain/confidence.ts`).

## 6. Metrics Implemented

Against the challenge brief's list:

| Brief | Implemented as |
|---|---|
| Installed equipment by modality | `byModality`, units and observations, biggest first |
| Installed equipment by geography | `byCountry` (country level; city is captured but not yet aggregated) |
| Equipment by estimated age | `byAge`, every bucket reported including empty ones |
| Customers with aging technology | `agingSites` |
| Customers with incomplete information | `completeness`, plus a per-field breakdown of what is missing |
| Recently updated customer sites | `recentlyUpdatedSites` |
| Confidence / freshness of information | `byConfidence`, and `staleSites` for freshness |
| Potential refresh opportunities | Same list as aging technology — the two are one signal today |

## 7. Limitations

- **Duplicate observations are counted twice** (§2). This is the single largest
  caveat and the reason the wording on the screen is "reportadas".
- **The SQL is unverified.** `database/repositories/dashboard-repository.ts`
  has never executed: `expo-sqlite` cannot run under Jest, so the two queries
  in it are covered by no test. They need the device checklist below.
- **Geography stops at country.** City is read and rolled into each site but
  not aggregated on its own; the brief's Region → Country → City → Customer
  drill-down is not built.
- **No drill-down.** Tapping a site does not open a Customer 360 view; the
  brief lists that as a separate experience and it needs an observation-detail
  screen that does not exist.
- **No charts.** Counts are rendered as rows, not bars. No charting library is
  chosen anywhere in `docs/` and adding one would be an undeclared
  architectural dependency (CLAUDE.md §18).
- **Recomputed on every load.** The metrics are a snapshot; pull to refresh
  recomputes them. There is no cache and no incremental update — at field-device
  volumes the read is cheap, and a stale cache on a dashboard is worse than a
  short wait.

## 8. Device Checklist

Nothing below has been executed. Requires the development build
(`npx expo run:android` / `run:ios`).

1. **The two queries run at all.** Open *Tablero* with at least one saved
   observation. A SQL error surfaces as the error state with the real message.
2. **Airplane mode.** Every number must render identically with the radio off.
   This is the whole feature; if it needs the network, something imported a
   transport it should not have.
3. **A freshly captured observation appears** after pull-to-refresh, while its
   sync badge still says pending.
4. **`sync_records` counts match** what the capture flow wrote — every record
   should be `pending` until a backend exists.
5. **A site with no country or modality** renders in the "sin registrar" rows
   rather than vanishing.
