# Offline and Synchronization

## 1. Purpose

This document defines how the application behaves without network
connectivity and how local data is synchronized with the central server.

## 2. Offline-First Principle

The application must remain useful without Internet access.

The following operations should be available offline:

- View locally available sites.
- View locally available equipment.
- View locally available observations.
- Capture voice.
- Capture text.
- Capture images.
- Execute local AI inference.
- Validate extracted information.
- Save observations locally.
- View locally available maps.
- View locally available dashboard data.
- View synchronization status.

## 3. Local Persistence

Every user-created observation must be persisted locally before it is
considered successfully saved.

The application must not depend on a successful network request to
complete the local capture workflow.

## 4. Local Data States

Records may have the following synchronization states:

- `local_only`
- `pending`
- `syncing`
- `synchronized`
- `failed`
- `conflict`

Note on `conflict`: it is **not written by the implemented upload flow**. Under
client-wins the device version becomes what the server holds, so a resolved
conflict leaves the record genuinely `synchronized`; marking it `conflict`
would leave it queued forever. The value is kept for the download direction,
where a server change can conflict with a locally pending one. See
`docs/sync-api.md` §8.

## 5. Synchronization Flow

```text
User creates observation
        ↓
Validate locally
        ↓
Save to local database
        ↓
Mark as pending
        ↓
Network becomes available
        ↓
Upload to server
        ↓
Server validates and stores
        ↓
Mark as synchronized
```

## 6. Failure Handling

If synchronization fails:

- Preserve the local record.
- Preserve the failure reason.
- Mark the record as failed.
- Allow retry.
- Do not duplicate the record on retry.
- Do not silently discard the record.

## 7. Idempotency

Synchronization operations must be idempotent.

Retrying the same operation must not create duplicate records.

Stable identifiers must be used to identify local entities.

## 8. Conflict Resolution (Confirmed: Client-Wins)

A conflict occurs when local and server versions differ.

**Confirmed policy: client-wins.** When a record has changed both
locally and on the server, the local (device) version always takes
precedence; the server is updated to match it on next sync.

Why this fits the field-work use case: the device is physically at the
site making the observation, so its version usually reflects the most
current, first-hand information.

Caveat to watch during implementation — this policy resolves
*device-vs-server* conflicts, not *device-vs-device* conflicts. If two
different field users edit the same `Equipment` record while both
offline, whichever device syncs second will overwrite what the first
device already pushed, silently from the server's point of view. This
is acceptable for `Observation` records (new observations are appended,
not overwritten — see `docs/domain-model.md` §14, historical data is
never deleted), but is a real risk for shared, mutable records like
`Equipment` if the same equipment is visited by more than one user
between syncs. Flagging this now so it's a conscious trade-off, not a
surprise later; no change needed unless multi-user contention on the
same equipment record turns out to be common in practice.

## 9. Historical Observations

Historical observations must be preserved during synchronization.

A newer observation must not automatically delete an older observation.

## 10. Partial Synchronization

The application should support synchronizing only the records required by
the current user or selected site.

The complete server dataset should not be downloaded by default.

## 11. Map Synchronization

Map resources and business data are synchronized separately.

Downloading a map region does not automatically download all equipment
data.

The application must maintain separate states for:

- Map download.
- Business data download.
- Business data synchronization.

## 12. Offline Maps

The application should allow users to download map regions.

The initial priority is:

1. User's city.
2. User's country.
3. Other regions requested by the user.

**Confirmed: tile source is self-hosted, not a third-party cloud
provider.** Tiles are generated offline from OpenStreetMap extracts
using Protomaps or the OpenMapTiles toolchain, producing a
`.pmtiles`/`.mbtiles` file. That file is either bundled with the app for
the initial region or served for download from the project's own
backend (`docs/tech-stack.md` §5) — never fetched at runtime from a
third-party map SaaS (MapTiler, Stadia Maps, Mapbox, etc.), since that
would reintroduce a live cloud dependency this project explicitly rules
out. See `docs/tech-stack.md` §8 for the full rationale.

MapLibre's offline functionality provides region-based resource downloads.
The implementation must track download progress, errors, and completion
locally. Exact API usage depends on the installed MapLibre version.

## 13. Bluetooth Synchronization

Bluetooth synchronization is experimental.

The initial MVP should not depend on Bluetooth to maintain data
consistency.

If implemented, it must define:

- Authentication.
- Data scope.
- Encryption.
- Conflict resolution.
- Transfer status.
- Retry behavior.
- User consent.

## 14. Implemented Protocol

The **upload direction** is implemented and specified in `docs/sync-api.md`:
`POST /v1/sync` against a Node.js + PostgreSQL server, with per-record
outcomes, replay detection, and the client-wins resolution of §8 above.

This resolves two items previously listed here as open:

- **Exact synchronization protocol** → `docs/sync-api.md` §3 (upload only).
- **Server versioning model** → a monotonic integer `server_version` per
  entity, held in `sync_entity_state` on the server and mirrored into
  `sync_records.server_version` on the device. Divergence is detected by
  comparing the client's last-seen version with the server's current one
  (`docs/sync-api.md` §5).

## 15. Still Open

- **The download direction.** Not implemented, and blocked on three separate
  decisions — the cursor's semantics, what "the records this user needs" means
  (§10 above), and tombstones for deletes. See `docs/sync-api.md` §2.
- **Deletion.** `operation: 'delete'` is rejected by the server; the
  soft-delete strategy is undecided (`docs/database.md` §16).
- **How a resolved conflict is surfaced to the field user.** It is reported by
  the sync run and archived on the server, but nothing durable is written
  locally. See `docs/sync-api.md` §8.
- **Binary transfer** of photos and audio (`docs/sync-api.md` §10).
- Maximum map cache size.
- Data retention policy — including how long the server's `sync_conflicts`
  archive is kept.
- Bluetooth protocol.
