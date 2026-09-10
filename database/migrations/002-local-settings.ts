import type { Migration } from '../migrator';

/**
 * Migration 002 — local settings.
 *
 * Added for one reason: synchronization needs a stable per-installation
 * identifier. The server distinguishes a retried request from a genuinely new
 * one by `(device_id, entity_id, local_version)` (docs/offline-sync.md §7); a
 * device id that changed on every launch would make every retry look like a
 * new change, and — once two devices can hold the same record — would make one
 * device's change look like a replay of another's and be skipped.
 *
 * Why a key/value table rather than a `device_id` column somewhere:
 * `docs/database.md` §2 already names "local configuration" as something the
 * local database stores, but §4 lists no table for it. Device-level state has
 * no natural home among nine per-entity tables, and the alternative — a
 * one-row `device` table — would need a new migration again for the next piece
 * of device state.
 *
 * Deliberately NOT used for the incremental-sync cursor. `docs/database.md`
 * §17.2 records that the cursor is still proposed, and the download direction
 * is not implemented (docs/sync-api.md §10). This table gives that decision a
 * place to land; it does not make it.
 *
 * Values are plain text and this table is not encrypted. Nothing sensitive may
 * be stored here — no tokens, no credentials (CLAUDE.md §15). The device id is
 * a random UUID that identifies an installation to the sync server and is not
 * a secret.
 */
export const migration002: Migration = {
  version: 2,
  name: 'local-settings',
  up: `
CREATE TABLE local_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
