# Sync Server

Node.js + PostgreSQL. Serves one endpoint, `POST /v1/sync`, specified in
`docs/sync-api.md`.

Separate `package.json` on purpose: `pg` must never end up in the mobile app's
dependency tree. The mobile app and this server share exactly one thing, the
wire contract in `types/sync-contract.ts`.

## Requirements

- Node.js 24 (same baseline as the mobile workspace)
- PostgreSQL ≥ 11 (`hashtextextended`, used for the per-entity advisory lock)

## Setup

```bash
cd server
npm install
export DATABASE_URL=postgres://user:password@host:5432/database
npm run migrate     # applies migrations/001_initial_schema.sql (idempotent)
npm run build
npm start
```

`DATABASE_URL` is read from the environment and has no default. No connection
string or credential is committed anywhere in this repository (CLAUDE.md §15).

`PORT` defaults to 8080.

## Authentication

**The server refuses every request without configured credentials.** Set
`SYNC_DEVICE_CREDENTIALS` for the provisioned device-token authenticator; see
[the integrated client setup below](#integrated-mobile-client-september-2026).
`createRejectingAuthenticator` remains the fallback when configuration is absent.

To exercise the endpoint locally:

```bash
SYNC_ALLOW_INSECURE_DEV_AUTH=true npm start
```

That switches in `createInsecureDevAuthenticator`, which trusts `x-user-id` and
`x-device-id` headers and verifies nothing. **Development only.** Anyone who can
reach the port can claim to be any user. The process prints a warning on every
start with it enabled.

The mobile client uses the device-token implementation of `Authenticator`;
corporate authentication can replace that port without changing synchronization.

## Users

`users` rows are **not** created by synchronization — see `docs/sync-api.md` §6.
Provision the UUID shown by the mobile dashboard through an administrative
process before granting device credentials. For isolated tests, an example is:

```sql
INSERT INTO users (id, name, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Field User', 'field_user');
```

An observation whose `created_by` is unknown to the server is rejected with
`missing_reference` — retryable, so it stays queued on the device.

## Layout

```
migrations/          Central schema (plain SQL, applied with psql)
src/domain/          Client-wins decision, dependency ordering — pure, no I/O
src/validation/      Payload validation; the device is untrusted here
src/application/     The batch, and the ports it depends on
src/http/            The endpoint as a pure request→response function
src/infrastructure/  Postgres store; the only place SQL is executed
src/main.ts          Process entrypoint (node:http)
```

`src/main.ts` uses Node's built-in `http` rather than Express or Fastify.
`docs/tech-stack.md` §5 named those as part of a *proposal*, and one path with
one method needs no router. The endpoint itself is framework-agnostic, so
adopting one later is a change to that file alone.

## Tests

Server tests live in the repository root suite (`tests/server/`) and run with
`npm test` from the root — the pure layers have no external imports, so they
need neither `pg` nor this package's `node_modules`.

That suite runs the store against a fake driver, so it checks the order of
statements but never executes SQL. For that, use the integration check:

```bash
createdb hei_check
DATABASE_URL=postgres://user@localhost:5432/hei_check \
SYNC_INTEGRATION_ALLOW_DESTRUCTIVE=true \
  npm run verify
```

It applies the real schema and drives the real endpoint — replay, conflict
overwrite, foreign-key rejection, child-row replacement, two-device
divergence. It **TRUNCATEs the tables it uses**, hence the explicit opt-in;
point it at a scratch database, never at anything real (CLAUDE.md §9).

It has been run against PostgreSQL 16.14. What remains unverified is listed in
`docs/sync-api.md` §12.2.

## Type-checking

```bash
npm run typecheck            # this package
npm run typecheck --prefix .. # the mobile app; also covers the pure server files
```

## Integrated mobile client (September 2026)

The MVP now supports provisioned per-device bearer credentials. Configure
`SYNC_DEVICE_CREDENTIALS` with JSON entries `{ userId, deviceId, tokenSha256 }`
and provision the matching user in Postgres. The mobile dashboard displays the
IDs and accepts the token in memory. Details and rotation/revocation steps:
[Sync API §14](../docs/sync-api.md#14-conexion-operativa-del-mvp).

Normal startup:

```bash
npm ci --prefix server
npm run build --prefix server
# Export DATABASE_URL and SYNC_DEVICE_CREDENTIALS through your deployment's secret configuration.
npm run migrate --prefix server
NODE_ENV=production npm start --prefix server
```

`HOST` defaults to `127.0.0.1`, `PORT` to `8080`. Put the server behind your
HTTPS reverse proxy. Missing credential configuration still rejects requests;
malformed credential configuration fails startup. The insecure test authenticator
cannot start with `NODE_ENV=production` and always binds loopback. No cloud
service, DNS record, certificate or production database is provisioned by these
commands.
