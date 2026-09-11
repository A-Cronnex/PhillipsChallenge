import { runPull } from '../../../features/synchronization/application/pull';
import type {
  AppliedPull,
  SyncDownloadRepository,
} from '../../../features/synchronization/application/ports';
import type { PulledChange, SyncPullRequest, SyncPullResponse } from '../../../types/sync-contract';

const site = (id: string): PulledChange => ({
  entityType: 'site', entityId: id, serverVersion: 1, updatedAt: '2026-09-10T00:00:00.000Z',
  payload: { name: `Sitio ${id}`, country: 'Panamá', city: 'Ciudad de Panamá', latitude: 9, longitude: -79.5,
    address: null, createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
});

function downloads(overrides: Partial<SyncDownloadRepository> = {}) {
  const cursors: string[] = [];
  const applied: PulledChange[][] = [];
  const repository: SyncDownloadRepository = {
    getPullCursor: async () => null,
    setPullCursor: async cursor => { cursors.push(cursor); },
    listKnownSiteIds: async () => ['known-site'],
    listDownloadedRegionBounds: async () => [[-79.6, 8.9, -79.4, 9.1]],
    applyPulledChanges: async (changes): Promise<AppliedPull> => {
      applied.push(changes);
      return { applied: changes.length, skipped: [] };
    },
    ...overrides,
  };
  return { repository, cursors, applied };
}

function transport(pages: SyncPullResponse[]) {
  const requests: SyncPullRequest[] = [];
  return {
    requests,
    async pull(request: SyncPullRequest) {
      requests.push(request);
      const page = pages[requests.length - 1];
      return page
        ? ({ status: 'ok', response: page } as const)
        : ({ status: 'failed', reason: 'sin páginas', retryable: true } as const);
    },
  };
}

const deps = (repository: SyncDownloadRepository, pull: ReturnType<typeof transport>) => ({
  downloads: repository, transport: pull, deviceId: 'device-1', now: () => new Date('2026-09-11T00:00:00Z'),
});

test('sends the device scope: downloaded regions and the sites it already holds', async () => {
  const { repository } = downloads();
  const pull = transport([{ serverTime: 'now', changes: [], cursor: '0', hasMore: false }]);
  await runPull(deps(repository, pull));
  expect(pull.requests[0]).toMatchObject({
    cursor: null, knownSiteIds: ['known-site'],
    regions: [{ bounds: [-79.6, 8.9, -79.4, 9.1] }],
  });
});

test('applies pages in order and stores the cursor only after each is applied', async () => {
  const { repository, cursors, applied } = downloads();
  const pull = transport([
    { serverTime: 'now', changes: [site('a')], cursor: '5', hasMore: true },
    { serverTime: 'now', changes: [site('b')], cursor: '9', hasMore: false },
  ]);
  const report = await runPull(deps(repository, pull));
  expect(report.status).toBe('completed');
  expect(report.applied).toBe(2);
  expect(report.pages).toBe(2);
  expect(applied.map(page => page.map(change => change.entityId))).toEqual([['a'], ['b']]);
  expect(cursors).toEqual(['5', '9']);
  // The second request resumes from the first page's cursor.
  expect(pull.requests[1].cursor).toBe('5');
});

test('a transport failure leaves the cursor untouched so the next run resumes', async () => {
  const { repository, cursors } = downloads({ getPullCursor: async () => '12' });
  const pull = transport([]);
  const report = await runPull(deps(repository, pull));
  expect(report.status).toBe('transport_failed');
  expect(report.applied).toBe(0);
  expect(cursors).toEqual([]);
  expect(pull.requests[0].cursor).toBe('12');
});

test('a record with an unsent local change is kept, reported, and does not stall the cursor', async () => {
  const { repository, cursors } = downloads({
    applyPulledChanges: async (changes) => ({
      applied: 0,
      skipped: changes.map(change => ({ entityType: change.entityType, entityId: change.entityId, reason: 'local_pending' as const })),
    }),
  });
  const pull = transport([{ serverTime: 'now', changes: [site('a')], cursor: '7', hasMore: false }]);
  const report = await runPull(deps(repository, pull));
  expect(report.applied).toBe(0);
  expect(report.skipped).toEqual([{ entityType: 'site', entityId: 'a', reason: 'local_pending' }]);
  // Delivered and decided upon: not advancing would re-fetch it forever.
  expect(cursors).toEqual(['7']);
});

test('stops after the page budget and says more is waiting', async () => {
  const { repository } = downloads();
  const pull = transport([
    { serverTime: 'now', changes: [site('a')], cursor: '1', hasMore: true },
    { serverTime: 'now', changes: [site('b')], cursor: '2', hasMore: true },
  ]);
  const report = await runPull({ ...deps(repository, pull), maxPages: 2 });
  expect(report.pages).toBe(2);
  expect(report.moreAvailable).toBe(true);
});

test('does nothing at all when no server is configured', async () => {
  const { repository, cursors } = downloads();
  const report = await runPull({ ...deps(repository, transport([])), transport: null });
  expect(report).toMatchObject({ status: 'not_configured', applied: 0, pages: 0 });
  expect(cursors).toEqual([]);
});
