import type { Migration } from '../migrator';
export const migration003: Migration = {
  version: 3,
  name: 'conversation-drafts',
  up: `CREATE TABLE conversation_drafts (
    conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL
  );`,
};
