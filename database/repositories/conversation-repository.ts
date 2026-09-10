import type * as SQLite from 'expo-sqlite';
import type { ConversationRepository } from '../../features/conversations/application/ports';
import type { ConversationState } from '../../features/conversations/domain/conversation';
import { writeObservation } from './observation-repository';

export function createConversationRepository(db: SQLite.SQLiteDatabase, newId: () => string): ConversationRepository {
  async function write(tx: SQLite.SQLiteDatabase, state: ConversationState) {
    const at = new Date().toISOString();
    await tx.runAsync(`INSERT INTO conversations (id, user_id, started_at, ended_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      status = excluded.status, ended_at = excluded.ended_at, updated_at = excluded.updated_at`,
      [state.id, state.userId, state.startedAt, state.status === 'saved' ? at : null, state.status, state.startedAt, at]);
    await tx.runAsync(`INSERT INTO conversation_drafts (conversation_id, state_json) VALUES (?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET state_json = excluded.state_json`, [state.id, JSON.stringify(state)]);
    await tx.runAsync(`INSERT INTO sync_records (id, entity_type, entity_id, operation, sync_status, local_version, created_at, updated_at)
      VALUES (?, 'conversation', ?, 'create', 'pending', 1, ?, ?) ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      operation = CASE WHEN server_version IS NULL THEN 'create' ELSE 'update' END,
      sync_status = 'pending', local_version = local_version + 1, updated_at = excluded.updated_at`, [newId(), state.id, at, at]);
  }
  return {
    async save(state) {
      await db.withExclusiveTransactionAsync(async tx => { await write(tx, state); });
    },
    async latest(userId) {
      const row = await db.getFirstAsync<{ state_json: string }>(`SELECT d.state_json FROM conversation_drafts d
        JOIN conversations c ON c.id = d.conversation_id WHERE c.user_id = ?
        ORDER BY c.updated_at DESC, c.id DESC LIMIT 1`, [userId]);
      return row ? JSON.parse(row.state_json) as ConversationState : null;
    },
    async finalize(state, observation) {
      await db.withExclusiveTransactionAsync(async tx => {
        const existing = await tx.getFirstAsync('SELECT id FROM observations WHERE conversation_id = ?', [state.id]);
        if (existing) return; // Retrying after an interrupted confirmation never duplicates the visit.
        await write(tx, { ...state, status: 'saved' });
        await writeObservation(tx, newId, observation, 'pending');
      });
    },
  };
}
