-- ---------------------------------------------------------------------------
-- Central schema, migration 001.
--
-- docs/database.md §16 listed "server schema" as an open decision; Node.js +
-- Postgres is now confirmed, so this file is that decision. The rationale for
-- every place it diverges from the local SQLite schema
-- (database/migrations/001-initial-schema.ts) is in docs/sync-api.md §6.
--
-- Applied with:  psql "$DATABASE_URL" -f server/migrations/001_initial_schema.sql
-- It is idempotent (IF NOT EXISTS), so re-running it is safe.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- users
--
-- NOT synchronized. `users` is absent from SYNC_ENTITY_TYPES in
-- types/domain.ts, and it stays absent here on purpose: letting a device
-- create identities by uploading them would mean any caller could mint a user
-- and then attribute observations to it (CLAUDE.md §15, least privilege).
-- Users are provisioned out-of-band by whatever authentication protocol is
-- eventually chosen — still an open decision (CLAUDE.md §18).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL
             CHECK (role IN ('field_user', 'sales', 'medical_staff')),
  site_id    UUID,
  city       TEXT,
  country    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  country    TEXT,
  city       TEXT,
  latitude   DOUBLE PRECISION
             CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude  DOUBLE PRECISION
             CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_site_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- equipment
-- RESTRICT mirrors the local schema: deleting a site must never silently
-- destroy what was recorded at it (CLAUDE.md §6).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment (
  id                UUID PRIMARY KEY,
  site_id           UUID NOT NULL REFERENCES sites (id) ON DELETE RESTRICT,
  brand             TEXT,
  model             TEXT,
  modality          TEXT,
  quantity          INTEGER CHECK (quantity IS NULL OR quantity > 0),
  installation_year INTEGER
                    CHECK (installation_year IS NULL
                           OR installation_year BETWEEN 1900 AND 2100),
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  started_at           TIMESTAMPTZ NOT NULL,
  ended_at             TIMESTAMPTZ,
  status               TEXT NOT NULL
                       CHECK (status IN ('collecting', 'awaiting_clarification',
                                         'awaiting_confirmation', 'ready_to_save',
                                         'saved', 'failed')),
  transcript_reference TEXT,
  summary              TEXT,
  created_at           TIMESTAMPTZ NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- observations
--
-- Append-only from the endpoint's point of view: there is no DELETE path in
-- the sync service (docs/offline-sync.md §9). An update replaces the row, and
-- the state it replaced is archived in sync_conflicts when the replacement was
-- a conflict, so nothing is silently lost (docs/offline-sync.md §11).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observations (
  id                          UUID PRIMARY KEY,
  equipment_id                UUID REFERENCES equipment (id) ON DELETE RESTRICT,
  site_id                     UUID NOT NULL REFERENCES sites (id) ON DELETE RESTRICT,
  conversation_id             UUID REFERENCES conversations (id) ON DELETE SET NULL,
  visit_date                  DATE NOT NULL,
  quantity                    INTEGER CHECK (quantity IS NULL OR quantity > 0),
  brand                       TEXT,
  model                       TEXT,
  modality                    TEXT,
  estimated_years_of_use      INTEGER
                              CHECK (estimated_years_of_use IS NULL
                                     OR estimated_years_of_use >= 0),
  estimated_installation_year INTEGER
                              CHECK (estimated_installation_year IS NULL
                                     OR estimated_installation_year
                                        BETWEEN 1900 AND 2100),
  -- No CHECK, matching the local schema: the allowed values are not
  -- enumerated in any document, and constraining them would mean inventing a
  -- vocabulary (CLAUDE.md §8).
  operational_status          TEXT,
  capture_source              TEXT
                              CHECK (capture_source IS NULL
                                     OR capture_source IN ('voice', 'text', 'image')),
  notes                       TEXT,
  overall_confidence          TEXT
                              CHECK (overall_confidence IS NULL
                                     OR overall_confidence IN ('high', 'medium', 'low')),
  created_by                  UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at                  TIMESTAMPTZ NOT NULL,
  updated_at                  TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- observation children
--
-- CASCADE, as locally: these rows are wholly owned by their observation and
-- are replaced wholesale when it is re-uploaded (docs/database.md §12).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observation_sources (
  -- Surrogate key. The device's own observation_sources.id is local
  -- bookkeeping and is not carried on the wire, and a natural key over
  -- (observation_id, source, reference) is impossible because `reference` is
  -- nullable and Postgres primary keys cannot contain NULL. These rows are
  -- replaced wholesale whenever their observation is uploaded, so their
  -- identity never has to survive an update.
  id             BIGSERIAL PRIMARY KEY,
  observation_id UUID NOT NULL REFERENCES observations (id) ON DELETE CASCADE,
  source         TEXT NOT NULL CHECK (source IN ('voice', 'text', 'image')),
  reference      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observation_sources_obs
  ON observation_sources (observation_id);

CREATE TABLE IF NOT EXISTS attribute_confidence (
  observation_id   UUID NOT NULL REFERENCES observations (id) ON DELETE CASCADE,
  attribute_name   TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low')),
  attribute_status TEXT NOT NULL
                   CHECK (attribute_status IN ('confirmed', 'reported',
                                               'estimated', 'unknown')),
  source           TEXT CHECK (source IS NULL
                               OR source IN ('voice', 'text', 'image')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Mirrors UNIQUE (observation_id, attribute_name) locally: one confidence
  -- row per attribute per observation, never an accumulating pile.
  PRIMARY KEY (observation_id, attribute_name)
);

-- ---------------------------------------------------------------------------
-- sync_entity_state
--
-- The server-side counterpart of the device's `sync_records`. One row per
-- synchronized entity, holding the authoritative `server_version` plus what is
-- needed to recognise a replayed request.
--
-- A single polymorphic table rather than version columns on each business
-- table: conflict detection and replay detection are then one query and one
-- code path for every entity type, and the business tables stay free of
-- protocol bookkeeping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_entity_state (
  entity_type               TEXT NOT NULL
                            CHECK (entity_type IN ('site', 'equipment',
                                                   'observation', 'conversation')),
  entity_id                 UUID NOT NULL,
  server_version            INTEGER NOT NULL CHECK (server_version > 0),
  -- Replay detection (docs/offline-sync.md §7). If the same device re-sends
  -- the same local version — because the response to its first attempt was
  -- lost — the change is recognised and the stored outcome is returned
  -- instead of being applied a second time.
  last_applied_device_id    UUID NOT NULL,
  last_applied_local_version INTEGER NOT NULL,
  -- The outcome reported for that last applied change, replayed verbatim.
  last_outcome              TEXT NOT NULL
                            CHECK (last_outcome IN ('synchronized',
                                                    'conflict_overwritten')),
  last_previous_version     INTEGER,
  last_applied_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- sync_conflicts
--
-- What client-wins overwrote. docs/offline-sync.md §11 forbids silently
-- resolving a conflict by overwriting data; the policy in §8 requires the
-- overwrite, so the resolution is to keep the replaced state here rather than
-- to refuse it.
--
-- The replaced state is stored as JSONB rather than as shadow tables: it is an
-- audit record read by a human when something looks wrong, not business data
-- joined by queries, and one column covers every entity type without four more
-- table definitions to keep in step.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id                        BIGSERIAL PRIMARY KEY,
  entity_type               TEXT NOT NULL,
  entity_id                 UUID NOT NULL,
  overwritten_server_version INTEGER NOT NULL,
  overwritten_state         JSONB NOT NULL,
  resolved_by_device_id     UUID NOT NULL,
  resolved_by_local_version INTEGER NOT NULL,
  -- Always 'client_wins' today. Present so that a future policy change is a
  -- new value in this column and not a silent reinterpretation of old rows.
  resolution                TEXT NOT NULL DEFAULT 'client_wins',
  detected_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_equipment_site_id        ON equipment (site_id);
CREATE INDEX IF NOT EXISTS idx_observations_site_id     ON observations (site_id);
CREATE INDEX IF NOT EXISTS idx_observations_equipment   ON observations (equipment_id);
CREATE INDEX IF NOT EXISTS idx_observations_visit_date  ON observations (visit_date);
CREATE INDEX IF NOT EXISTS idx_observations_created_by  ON observations (created_by);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id    ON conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity    ON sync_conflicts (entity_type, entity_id);

COMMIT;
