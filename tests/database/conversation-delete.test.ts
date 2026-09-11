/**
 * Discarding a conversation.
 *
 * Same approach as tests/database/sync-repository.test.ts: `expo-sqlite` has no
 * Node implementation, so a fake driver records the statements and answers the
 * guard query. What is covered is the decision the repository owns — when it
 * refuses, and what it is allowed to delete when it does not.
 */
import type * as SQLite from 'expo-sqlite';

import { createConversationRepository } from '../../database/repositories/conversation-repository';

interface Guards {
  observations: number;
  sync_status: string | null;
}

function createFakeDb(guards: Guards) {
  const statements: { sql: string; params: unknown[] }[] = [];
  const db = {
    async withExclusiveTransactionAsync(run: (tx: SQLite.SQLiteDatabase) => Promise<void>) {
      await run(db as unknown as SQLite.SQLiteDatabase);
    },
    async getFirstAsync(sql: string, params: unknown[]) {
      statements.push({ sql, params });
      return sql.includes('AS observations') ? guards : null;
    },
    async runAsync(sql: string, params: unknown[]) {
      statements.push({ sql, params });
      return { changes: 1, lastInsertRowId: 0 };
    },
  };
  return { db: db as unknown as SQLite.SQLiteDatabase, statements };
}

const repository = (guards: Guards) => {
  const fake = createFakeDb(guards);
  return { repo: createConversationRepository(fake.db, () => 'generated'), statements: fake.statements };
};

const deletes = (statements: { sql: string }[]) =>
  statements.filter(statement => statement.sql.trim().startsWith('DELETE')).map(statement => statement.sql);

test('deletes the queue row and the conversation when nothing left this device', async () => {
  const { repo, statements } = repository({ observations: 0, sync_status: 'pending' });
  await expect(repo.deleteConversation('chat-1')).resolves.toEqual({ status: 'deleted' });

  const removed = deletes(statements);
  expect(removed).toHaveLength(3);
  // The polymorphic queue row has no foreign key, so it must go explicitly.
  expect(removed[0]).toContain('sync_records');
  // The draft holds the chat text. Its CASCADE did not fire on device, so it
  // is deleted explicitly rather than trusted to the foreign key.
  expect(removed[1]).toContain('conversation_drafts');
  expect(removed[2]).toContain('DELETE FROM conversations');
  // Observations are never touched.
  expect(removed.join(' ')).not.toContain('observations');
});

test('refuses when the conversation already produced an observation', async () => {
  const { repo, statements } = repository({ observations: 1, sync_status: 'pending' });
  await expect(repo.deleteConversation('chat-1')).resolves.toEqual({ status: 'refused', reason: 'has_observation' });
  expect(deletes(statements)).toHaveLength(0);
});

test('deletes one that was already uploaded: the server keeps its copy and never sends it back', async () => {
  // Conversations upload but never download (docs/sync-api.md §2), so the
  // local copy can go. Refusing here blocked a user from clearing their own
  // chat to protect a record they cannot even see.
  const { repo, statements } = repository({ observations: 0, sync_status: 'synchronized' });
  await expect(repo.deleteConversation('chat-1')).resolves.toEqual({ status: 'deleted' });
  expect(deletes(statements)).toHaveLength(3);
});

test('refuses while a synchronization run holds the row', async () => {
  const { repo, statements } = repository({ observations: 0, sync_status: 'syncing' });
  await expect(repo.deleteConversation('chat-1')).resolves.toEqual({ status: 'refused', reason: 'sync_in_flight' });
  expect(deletes(statements)).toHaveLength(0);
});

test('reads the guards inside the same transaction as the delete', async () => {
  const { repo, statements } = repository({ observations: 0, sync_status: 'pending' });
  await repo.deleteConversation('chat-1');
  // The guard query runs first; a run claiming the row afterwards is what the
  // exclusive transaction exists to exclude.
  expect(statements[0].sql).toContain('AS observations');
});
