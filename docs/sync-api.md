# Synchronization API — `/v1/sync`

## 1. Purpose

This document specifies the synchronization endpoint and the device-side logic
that drives it, as implemented. It records the decisions taken while building
it and — just as importantly — the ones deliberately not taken.

Related: `docs/offline-sync.md` (behaviour), `docs/architecture.md` §11
(where this was proposed), `docs/tech-stack.md` §5 and §8 (stack and conflict
policy), `docs/database.md` §16–§17 (schemas).

## 2. Scope — What Is and Is Not Implemented

**Implemented: the upload (push) direction.**

```
device queue ──► POST /v1/sync ──► central Postgres
             ◄── per-record outcomes ──
```

**Not implemented: the download (pull) direction.** This is not an oversight.
Pulling requires three decisions that are still open:

| Requirement | Blocked on |
|---|---|
| An incremental cursor | `docs/database.md` §17.2 — the cursor is *Proposed*, has no confirmed semantics, and until migration 002 had no storage at all. |
| A scope for "the records this user needs" | `docs/offline-sync.md` §10 says the full dataset must not be downloaded, but not what the subset is. |
| Tombstones for deletes | The soft-delete strategy is open (`docs/database.md` §16). Without it, a pull cannot express "this was removed". |

Migration 002 (`local_settings`) gives the cursor a place to live when the
decision is made. It does not make the decision.

Also out of scope, and listed in §10.

## 3. Endpoint

`POST /v1/sync`

Versioned per `docs/architecture.md` §11. The contract is defined once, in
`types/sync-contract.ts`, and imported by both the device and the server so the
two cannot drift.

### 3.1 Request

```jsonc
{
  "deviceId": "uuid",              // this installation; drives replay detection
  "clientTime": "ISO-8601 UTC",
  "changes": [
    {
      "entityType": "site" | "equipment" | "conversation" | "observation",
      "entityId": "uuid",          // the id the record was created with
      "operation": "create" | "update",
      "localVersion": 3,           // sync_records.local_version
      "baseServerVersion": 2,      // sync_records.server_version, or null
      "updatedAt": "ISO-8601 UTC",
      "payload": { /* full entity state */ }
    }
  ]
}
```

`payload` is **full state, not a field-level diff.** Under client-wins the
device version replaces the server's outright, so there is nothing to merge
field by field; a diff format would imply a merge the policy says does not
happen.

An observation carries its `attributeConfidence` and `sources` rows inside its
payload. They have no sync record of their own (`types/domain.ts`) because they
are owned by the observation and written atomically with it
(`docs/database.md` §12).

### 3.2 Response

```jsonc
{
  "serverTime": "ISO-8601 UTC",
  "results": [
    { "entityType": "...", "entityId": "...", "outcome": "synchronized",
      "serverVersion": 4, "replayed": false },
    { "entityType": "...", "entityId": "...", "outcome": "conflict_overwritten",
      "serverVersion": 6, "previousServerVersion": 5, "replayed": false },
    { "entityType": "...", "entityId": "...", "outcome": "rejected",
      "code": "missing_reference", "reason": "..." }
  ]
}
```

**Result order is not significant.** The client matches results by
`(entityType, entityId)`. A change with no matching result is treated as
unconfirmed and stays queued — silence is never read as success.

### 3.3 Status codes

| Code | Meaning |
|---|---|
| 200 | Batch processed. Individual records may still be `rejected`. |
| 400 | Malformed request. Nothing was applied. |
| 401 | Unauthenticated, or `deviceId` does not match the authenticated device. |
| 404 / 405 | Wrong path or method. |
| 413 | Batch over `MAX_CHANGES_PER_BATCH`, or body over 2 MB. |
| 500 | Unexpected failure. Nothing was applied; the client retries. |

A whole-request error is deliberately distinct from a per-record `rejected`:
on the first, nothing was applied, so the client must not mark anything
synchronized.

## 4. Outcomes

| Outcome | Meaning | Local result |
|---|---|---|
| `synchronized` | Stored cleanly. | `sync_status = 'synchronized'` |
| `conflict_overwritten` | Stored, replacing a diverged server version. The replaced state is archived. | `sync_status = 'synchronized'`, reported as a conflict |
| `rejected` | Not stored. Carries a machine `code` and prose. | `sync_status = 'failed'`, retryable per code |

`conflict_overwritten` rather than plain `conflict` (the name proposed in
`docs/architecture.md` §11) because under client-wins the record *is* stored.
Calling it `conflict` would suggest the client should retry, which it must not.

Rejection codes: `invalid_payload`, `unsupported_operation`,
`not_owned_by_principal`, `missing_reference`, `storage_error`. The code is
separate from the prose so the client can branch without parsing English, and
so the device can show its own Spanish message
(`features/synchronization/domain/outcome-mapping.ts`).

## 5. Conflict Resolution — Client-Wins

Implemented in `server/src/domain/conflict.ts` as a pure function, and tested
exhaustively, because every branch is a way to lose a field user's data.

| Server state | Client's `baseServerVersion` | Decision |
|---|---|---|
| Same `(deviceId, localVersion)` as last applied | anything | **Replay** — report the stored outcome, write nothing |
| No record | anything | Insert at version 1 |
| `serverVersion == base` | matches | Update to `base + 1` |
| `serverVersion != base` | diverged | **Overwrite** to `serverVersion + 1`, archive the replaced state |

The checks run in that order. Replay is checked first because **a retry is not
a conflict**: checking divergence first would report a false
`conflict_overwritten` for every re-sent request, since the server version has
already moved past the client's base.

## 6. Central Schema

`server/migrations/001_initial_schema.sql`. `docs/database.md` §16 listed the
server schema as open; Node.js + Postgres is now confirmed, so this is that
decision. It mirrors the local SQLite schema, with these differences:

| Difference | Reason |
|---|---|
| `UUID` / `TIMESTAMPTZ` / `DATE` columns instead of `TEXT` | Postgres has real types; using them gets format validation and correct ordering for free. The device keeps `TEXT` because SQLite has neither. |
| `users` is not synchronizable | Letting a device create identities would let any caller mint a user and then attribute observations to it (CLAUDE.md §15). Users are provisioned out-of-band by whatever authentication protocol is chosen. |
| `sync_entity_state` replaces `sync_records` | The device tracks *its* pending work; the server tracks the authoritative version and what is needed to recognise a replay. One polymorphic table keeps conflict and replay detection to a single code path and keeps protocol bookkeeping out of the business tables. |
| `sync_conflicts` (new) | See §8. |
| Observation children keyed by `(observation_id, attribute_name)` and by a surrogate id | The device's own child-row ids are local bookkeeping and are not sent. Children are replaced wholesale on each upload, so their identity never has to survive an update. |
| No `created_by` in the observation `DO UPDATE` list | Authorship is audit information and must survive an update (CLAUDE.md §9). A device trying to change it is a no-op, not a rewrite of history. |

## 7. Known Caveats

**Device-vs-device conflicts are still the hazard `docs/offline-sync.md` §8
names.** Client-wins resolves device-vs-server. If two devices edit the same
`Equipment` record while both offline, the second to sync overwrites the first.
This implementation makes that *visible* (the second device gets
`conflict_overwritten`, and the replaced state is archived server-side) but it
does not prevent it. Observations are unaffected: they are appended, never
merged.

**A `baseServerVersion` the server has never held is not reported as a
conflict.** If a device says "I last saw server version 4" and the server has
no such entity, the record is simply inserted. That is correct for a fresh
server, and indistinguishable from server-side data loss. Detecting the
difference would need server-side tombstones, which depend on the undecided
delete strategy.

**Replay detection is per device.** Two devices sending the same
`localVersion` for the same entity are correctly treated as two distinct
changes, not as a replay — otherwise the second device's work would be dropped
silently.

## 8. Where a Resolved Conflict Is Visible

Three places, deliberately — and one place it is **not**.

1. **In the response**, as `conflict_overwritten` with the version it replaced.
2. **In `sync_conflicts` on the server**, which holds the full replaced state as
   JSONB. `docs/offline-sync.md` §11 forbids resolving a conflict by silently
   discarding data; client-wins requires the overwrite, so the resolution is to
   keep what was replaced.
3. **In the `SyncRunReport`** returned by `runSynchronization`, as
   `report.conflicts`.

**Not** in a durable local flag. The local `sync_status` value `conflict` is
*not* used: under client-wins the device version is what the server now holds,
so the record is genuinely `synchronized`. Marking it `conflict` would leave it
queued forever and re-uploaded on every run.

The consequence, stated plainly: **a caller that discards the `SyncRunReport`
discards the only device-side notification that a conflict happened.** Making it
durable would mean a new column or table, which would be inventing a data-model
decision (CLAUDE.md §8). It is listed in §13 instead.

## 9. Idempotency and Resumability

- **Stable UUIDs**, generated on the device (`lib/id.ts`), identify a record for
  its whole life. An upsert by id cannot duplicate.
- **Replay detection** on `(deviceId, entityId, localVersion)` means a retry
  whose first response was lost is recognised, not applied twice.
- **One transaction per change**, not per batch. A batch-wide transaction would
  be faster but would undo per-record outcomes: one bad record would roll back
  the good ones.
- **An advisory lock per entity key** (`pg_advisory_xact_lock`) serialises
  concurrent changes to the same entity. `SELECT ... FOR UPDATE` is not enough,
  because it locks nothing when the row does not exist yet — two devices
  creating the same entity would both compute version 1.
- **Batching** on the device. An interrupted run leaves the batches that already
  landed alone; the rest stay queued.
- **Stale-claim recovery.** Any row still `syncing` when a run starts belongs to
  a run that was killed, and is returned to `pending`. Without this, a record
  interrupted mid-upload would never be retried.
- **A local-version guard.** A record edited while its upload was in flight is
  requeued rather than marked synchronized, so the newer edit is not stranded.

## 10. Not Implemented

| Not implemented | Why |
|---|---|
| Download / pull | §2. |
| `operation: 'delete'` | Rejected with `unsupported_operation`. No soft-delete strategy (`docs/database.md` §16), and historical observations must be preserved (`docs/offline-sync.md` §9). |
| Binary upload (photos, audio) | `observation_sources.reference` travels as an opaque device path. Transferring the artifacts is a separate design (size limits, resumable upload, storage, retention). |
| A UI trigger for a sync run | No screen invokes `runSynchronization` yet. The pieces are wired in `lib/container.ts`; what is missing is a deliberate UI decision — a manual button, a connectivity listener, or both. |
| Automatic retry / backoff | A run stops after the first failed batch. Re-running is the caller's decision. |
| Bluetooth | Out of MVP scope (CLAUDE.md §12). |

## 11. Chosen Constants

These are starting values, not measured ones. Recorded so they are not mistaken
for findings:

| Constant | Value | Where |
|---|---|---|
| `MAX_CHANGES_PER_BATCH` | 50 | `types/sync-contract.ts` |
| `MAX_CHANGES_PER_RUN` | 200 | `features/synchronization/application/synchronize.ts` |
| `REQUEST_TIMEOUT_MS` | 30 s | `services/sync/http-transport.ts` |
| `MAX_TEXT_LENGTH` | 4000 | `types/sync-contract.ts` |
| Request body cap | 2 MB | `server/src/main.ts` |

## 12. Testing Status

Covered in the ordinary Jest run (`npm test`): the conflict decision, dependency
ordering, server-side validation, the batch service, the HTTP endpoint's status
codes and authentication ordering, the Postgres store's transaction sequencing
and error classification (against a fake driver), the device orchestrator, the
transport, the configuration rules, and the local queue repository (against a
fake driver).

### 12.1 Verified against a real PostgreSQL

`server/scripts/integration-check.ts` (`npm run verify --prefix server`) drives
the endpoint, the store and the migration against a live database. It is not
part of `npm test` because it needs one, and it TRUNCATEs the tables it uses,
so it refuses to run without `SYNC_INTEGRATION_ALLOW_DESTRUCTIVE=true`.

It has been run against **PostgreSQL 16.14**, and covers: the migration
applying cleanly and being re-runnable without destroying data; a batch sent in
the wrong order being reordered and stored; a replayed batch not duplicating a
row or advancing the version; a diverged update overwriting the server and
archiving the replaced state in `sync_conflicts`; observation children being
replaced rather than accumulated; `created_by` surviving an update; a missing
foreign key becoming a retryable `missing_reference`; a bad coordinate and a
`delete` being rejected while the rest of the batch succeeds; and a second
device's change *not* being mistaken for a replay.

### 12.2 Still not covered

- **The device's SQLite statements.** `expo-sqlite` has no Node implementation
  (`tests/database/migrations.test.ts`), so the queue repository's SQL is
  verified only against a fake driver. It needs a device or an emulator.
- **End-to-end device ↔ server.** Needs a built app and a running server.
- **Real concurrency.** The advisory lock is exercised, but not under two
  simultaneous writers; the race it guards against is reasoned about, not
  demonstrated.
- **Load and batch-size behaviour.** The constants in §11 are unmeasured.

## 13. Open Decisions Raised or Left by This Work

1. **Corporate identity integration.** The MVP now has provisioned device
   bearer credentials (§14). SSO/OIDC and self-service enrollment remain open.
2. **Durable conflict notifications.** The Tablero shows session counts; a
   persistent review history for field users remains open.
3. **The download direction**, and the cursor semantics it needs — see §2.
4. **Soft-delete / tombstones**, which block both deletes and pull.
5. **Automated user provisioning.** The MVP uses administrative provisioning
   of the UUID displayed by the local app (§14).
6. **Transport security beyond TLS** — whether payloads need encryption at rest
   on the server, and whether the local database needs encryption
   (`CLAUDE.md` §18).
7. **Retention of `sync_conflicts`** — the archive grows without bound; the data
   retention policy is open (`CLAUDE.md` §18).

## 14. Conexion operativa del MVP

Actualización del 9 de septiembre de 2026: el cliente lee
`EXPO_PUBLIC_SYNC_URL`, y el Tablero permite ejecutar el envío e introducir una
credencial. El servidor admite `SYNC_DEVICE_CREDENTIALS`. Esto reemplaza la
indecisión de autenticación mencionada en las secciones históricas anteriores
para el MVP; una integración corporativa OIDC/SSO sigue siendo trabajo futuro.

### Credencial por instalación

Decisión: bearer aleatorio de al menos 32 bytes generado por un administrador,
asociado a un UUID de usuario y uno de dispositivo. El cliente envía
`Authorization: Bearer …` y `x-device-id`. El servidor compara el hash SHA-256
del token, verifica el dispositivo y deriva el usuario del registro administrado,
nunca del cuerpo ni de `x-user-id`. Los controles de autoría del endpoint siguen
aplicándose. La app mantiene el token en memoria, sin guardarlo en SQLite,
AsyncStorage, archivos, variables públicas ni logs.

Provisionamiento:

1. En Tablero, mostrar los identificadores del usuario local y del dispositivo.
2. Crear ese mismo UUID de usuario en `users` de Postgres con nombre y rol
   `field_user`, mediante un procedimiento administrativo autorizado. Los
   usuarios no se crean aceptando identidades enviadas por `/v1/sync`.
3. Generar el token en un entorno administrativo seguro, entregar su valor al
   usuario por un canal seguro y guardar solo el digest en la configuración del
   servidor. Una forma de generarlo en esa terminal es:

   ```bash
   node -e 'const c=require("node:crypto"); const t=c.randomBytes(32).toString("base64url"); console.log("Token:",t); console.log("SHA-256:",c.createHash("sha256").update(t).digest("hex"));'
   ```

4. Configurar `SYNC_DEVICE_CREDENTIALS` como un array JSON de objetos con
   `userId`, `deviceId` y `tokenSha256` (64 caracteres hexadecimales). No guardar
   tokens reales ni configuración de usuarios reales en Git. Reiniciar el
   servidor después de cambiar las credenciales.
5. Configurar HTTPS delante del servidor. Por defecto escucha en
   `127.0.0.1`; `HOST` permite cambiarlo según la topología del despliegue.
6. Introducir el token en Tablero y sincronizar. Retirar su digest y reiniciar
   el servidor revoca esa credencial. Para rotar, generar un token nuevo.

El modo `SYNC_ALLOW_INSECURE_DEV_AUTH=true` se conserva para los tests antiguos,
pero solo escucha en loopback y se rechaza con `NODE_ENV=production`.
No es el modo de acceso de la aplicación integrada.

### Dependencias, auditoría y límites

- Registrar sitio encola `site`. Guardar una primera observación crea `equipment`
  si se eligió equipo nuevo; seleccionar equipo existente conserva su historial
  sin sobrescribir la ficha del equipo.
- Confirmar una conversación escribe conversación, observación, orígenes,
  confianzas, equipo nuevo si corresponde y cola dentro de una transacción.
- La cola prioriza sitios → equipos → conversaciones → observaciones **antes**
  del límite de cada ejecución. Así, un padre no queda detrás de sus hijos al
  repartir lotes. Si un padre falla, el servidor rechaza referencias no resueltas
  y el siguiente envío puede reintentarlas.
- El estado completo de los turnos vive en `conversation_drafts`, una tabla
  local que no se envía. Las fotos y audios permanecen en el almacenamiento
  privado de la app. El protocolo no transfiere bytes de esos archivos; sus
  referencias locales no se pueden abrir desde otro dispositivo.
- El Tablero muestra cuántos conflictos se resolvieron con la política
  client-wins. Esa notificación de sesión no es un registro histórico de
  conflictos para auditoría central.
- Solo se implementa **push**. No hay lectura del catálogo central, propagación
  de borrados ni recuperación del dataset desde otro teléfono. Requieren definir
  alcance por usuario/sitio, cursor y tombstones antes de ampliar el protocolo.
