-- ---------------------------------------------------------------------------
-- Migration 002 — a monotonic change sequence, so the download direction has
-- a cursor.
--
-- docs/sync-api.md §2 listed "an incremental cursor" as one of the three
-- things blocking the pull direction. `sync_entity_state.server_version` is
-- per entity, so it cannot order changes *across* entities, and
-- `last_applied_at` is a clock — two writes in the same millisecond, or a
-- clock adjustment, would make a timestamp cursor skip records silently.
--
-- A single sequence gives a total order that only ever moves forward. The
-- cursor a device stores is the highest `change_seq` it has applied, and the
-- next pull asks for `change_seq > cursor`. Re-sending the same cursor returns
-- the same page, which is what makes a pull resumable and idempotent
-- (docs/offline-sync.md §7).
--
-- Idempotent, like migration 001: safe to re-run.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE SEQUENCE IF NOT EXISTS sync_change_seq AS BIGINT START WITH 1 INCREMENT BY 1;

ALTER TABLE sync_entity_state
  ADD COLUMN IF NOT EXISTS change_seq BIGINT;

-- Existing rows predate the sequence. They are given values in
-- `last_applied_at` order so a device pulling for the first time receives
-- them oldest-first, the same order new changes will arrive in.
UPDATE sync_entity_state
   SET change_seq = nextval('sync_change_seq')
  FROM (
    SELECT entity_type, entity_id,
           row_number() OVER (ORDER BY last_applied_at, entity_type, entity_id) AS position
      FROM sync_entity_state
     WHERE change_seq IS NULL
  ) AS ordered
 WHERE sync_entity_state.entity_type = ordered.entity_type
   AND sync_entity_state.entity_id = ordered.entity_id
   AND sync_entity_state.change_seq IS NULL;

ALTER TABLE sync_entity_state
  ALTER COLUMN change_seq SET NOT NULL;

ALTER TABLE sync_entity_state
  ALTER COLUMN change_seq SET DEFAULT nextval('sync_change_seq');

-- The pull's only ordering and range predicate.
CREATE INDEX IF NOT EXISTS idx_sync_entity_state_change_seq
  ON sync_entity_state (change_seq);

COMMIT;
