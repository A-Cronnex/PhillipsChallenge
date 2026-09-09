# Manual Observation Capture

## 1. Purpose

Keyboard-only capture of an `Observation`. No AI, no voice, no image. It is
the fallback path when the user prefers typing, and the reference
implementation of the layering every other capture path should follow.

## 2. Layering

Dependencies point downward only (`docs/architecture.md` §6):

```
app/(tabs)/capture/index.tsx              route, mounts the feature screen
features/observations/ui/                 form, hook, form<->draft mapping, wording
        │
features/observations/application/        capture-observation.ts, ports.ts
        │
features/observations/domain/             observation.ts, validation.ts, confidence.ts
        │
features/observations/application/ports   ObservationRepository (interface)
        │
database/repositories/                    SQLite implementation
```

`lib/container.ts` is the composition root: the only place where the database
is wired to the repository implementations.

Constraints that hold today and should be checked when this changes:

- No file outside `database/` imports `expo-sqlite`.
- No file in `app/` or `components/` contains SQL.
- Nothing in `domain/` or `application/` imports React or React Native.
- `database/repositories/` imports only *ports and domain types* from
  `features/`, never UI.

## 3. Synchronization State

New observations are saved with **`sync_status = 'pending'`**
(`features/observations/application/capture-observation.ts`,
`INITIAL_SYNC_STATUS`).

`pending`, not `local_only`: the record is persisted locally and waiting to be
uploaded. That no transport exists yet does not change its intent, and starting
at `local_only` would mean migrating every row the day a backend is confirmed.
`local_only` stays reserved for records deliberately never synchronized.

Consequence: until a backend exists (`docs/tech-stack.md` §5) every observation
stays `pending` forever. The UI presents that as a normal state, not an error.
`synchronized` and `conflict` are currently unreachable; `SyncStatusBadge`
renders all six states from `docs/offline-sync.md` §4 so it needs no change
when sync lands.

## 4. Atomicity

`createObservationRepository.save` writes the observation, its
`attribute_confidence` rows, its `observation_sources` row and its
`sync_records` row in one transaction (`docs/database.md` §12). An observation
saved without its sync record would never be queued for upload while appearing
saved — the transaction is what prevents that.

On failure nothing is written, the service returns `failed`, and the screen
keeps the user's input on the form (`CLAUDE.md` §6).

## 5. Confidence and Status

- Manually typed values are recorded as **`reported`** — provided by the user
  without verification (`docs/domain-model.md` §8). Not `confirmed`, which
  requires a reliable source.
- `capture_source` is `text`, and one `observation_sources` row is written.
- Per-attribute confidence is optional. A selector appears only once an
  attribute has a value; no selection means no `attribute_confidence` row,
  which is deliberately different from recording low confidence.
- `overall_confidence` is derived by **`lowestWins`** — the lowest confidence
  among the recorded attributes. **PROPOSED, pending confirmation**
  (`docs/domain-model.md` §15 leaves the method open). `majorityVote` is
  implemented alongside it for comparison; switching is a one-line change in
  `features/observations/domain/confidence.ts`.

## 6. Validation Rules

Implemented in `features/observations/domain/validation.ts`. The domain emits
stable codes; `features/observations/ui/messages.ts` owns the Spanish wording,
so the rules are reusable by the AI capture path and the text can move to
`react-i18next` without touching domain code.

| Rule | Note |
|---|---|
| Site required | An observation with no site cannot be mapped or attributed. |
| Visit date required, `YYYY-MM-DD`, not in the future | |
| At least one of brand / model / modality | **PROPOSED** — see §8. |
| Quantity, if present, a positive integer | Mirrors the DB CHECK. |
| Years of use, if present, a non-negative integer | Mirrors the DB CHECK. |
| Installation year, if present, 1900–2100 | Mirrors the DB CHECK. |
| No confidence for an attribute left blank | Would describe nothing. |

All problems are reported at once, not one at a time.

## 7. Screen States

`docs/architecture.md` §4 and `CLAUDE.md` §13: loading (opening the local
database), error with retry (database unavailable), empty (no sites stored / no
local user), per-field validation feedback, explicit save confirmation carrying
the sync badge, and a save-failure banner that states the input was kept.

Errors and confirmations are announced through polite live regions rather than
being conveyed by colour alone. Touch targets are 48dp. No animation library is
used — none is chosen in the documentation (`CLAUDE.md` §18), and animation
must not interfere with capture (`CLAUDE.md` §13).

## 8. Open Decisions and Limitations

- **`REQUIRE_IDENTIFYING_ATTRIBUTE` is a proposed business rule.** Requiring at
  least one of brand/model/modality is not stated in `docs/domain-model.md` §6.
  It is a single exported flag; delete it if site-level visit records with no
  equipment information are legitimate.
- **The overall-confidence rule is proposed** (§5 above).
- **`operational_status` is a free-text field.** Its vocabulary is not defined
  anywhere, so there is neither a CHECK constraint nor a picker.
- **Equipment is never linked.** `equipment_id` is always null from this
  screen; duplicate detection and linking are not implemented.
- **Current user is an interim implementation.** With authentication undecided
  (`CLAUDE.md` §18), `createUserRepository` returns the earliest-created local
  user and the screen shows an empty state when there is none. Nothing creates
  a user yet, so the screen is unusable on a fresh install until a user row
  exists.
- **Sites are read-only here.** Creating a site is a separate feature; with no
  sites stored the screen shows an empty state.
- **No editing or listing of saved observations.** Capture only.
- **The other three sections** (Dashboard, Map, Conversations) are not declared
  in the tab layout, so the tab bar does not advertise screens that do not
  exist.

## 9. Tests

`npm test` — 83 tests across 6 suites, all passing:

- `tests/features/observations/validation.test.ts` — every domain rule,
  including boundary years and multi-error reporting.
- `tests/features/observations/confidence.test.ts` — both derivation strategies.
- `tests/features/observations/capture-observation.test.ts` — the service
  against a fake repository: pending state, no write on validation failure,
  `reported` status, derived confidence, trimming, failure handling.
- `tests/features/observations/form-mapping.test.ts` — string/number coercion.
- `tests/features/observations/ObservationCaptureForm.test.tsx` — loading,
  empty, error, validation feedback, save confirmation, input preserved on
  failure.
- `tests/database/migrations.test.ts` — the migrator.

**Not covered by `npm test`:** anything that opens a real database.
`expo-sqlite` has no Node implementation, so the repository's SQL is verified
separately by executing it against SQLite with the schema from migration 001;
end-to-end persistence still needs a device or emulator. See §10.

## 10. What Still Needs a Device

- Opening the real database through `expo-sqlite`, including the
  `foreign_keys = ON` and `journal_mode = WAL` pragmas in
  `database/connection.ts`. If the foreign-keys pragma does not take effect,
  every FK constraint silently stops being enforced.
- The migration actually running on device storage.
- Rendering: the tests assert behaviour through the test renderer, not layout.
- Real offline behaviour with the network disabled.
