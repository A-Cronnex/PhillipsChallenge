/**
 * The dashboard application service.
 *
 * The rules that matter here are offline rules: the metrics must not depend on
 * the network, on a backend existing, or on anything having been synchronized
 * (CLAUDE.md §6, docs/offline-sync.md §2).
 */
import {
  loadDashboard,
  toIsoDate,
} from '../../../features/dashboard/application/load-dashboard';
import type {
  DashboardRepository,
  SyncStateCounts,
  SyncStateRepository,
} from '../../../features/dashboard/application/ports';
import type { ObservationFact } from '../../../features/dashboard/domain/metrics';
import { SYNC_STATUSES, type SyncStatus } from '../../../types/domain';

const NOW = new Date('2026-09-09T14:48:00.000Z');

function fact(overrides: Partial<ObservationFact> = {}): ObservationFact {
  return {
    observationId: 'obs-1',
    siteId: 'site-1',
    siteName: 'Hospital Alfa',
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    visitDate: '2026-09-01',
    quantity: 2,
    brand: 'Philips',
    model: 'IntelliVue MX450',
    modality: 'Monitor',
    estimatedYearsOfUse: 3,
    estimatedInstallationYear: null,
    overallConfidence: 'high',
    ...overrides,
  };
}

function counts(partial: Partial<Record<SyncStatus, number>>): SyncStateCounts {
  const byStatus = Object.fromEntries(
    SYNC_STATUSES.map((status) => [status, partial[status] ?? 0])
  ) as Record<SyncStatus, number>;
  return {
    byStatus,
    total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
  };
}

function deps(options: {
  facts?: ObservationFact[] | Error;
  sync?: SyncStateCounts | Error;
}) {
  const dashboard: DashboardRepository = {
    async loadObservationFacts() {
      if (options.facts instanceof Error) throw options.facts;
      return options.facts ?? [];
    },
  };
  const syncState: SyncStateRepository = {
    async countByStatus() {
      if (options.sync instanceof Error) throw options.sync;
      return options.sync ?? counts({});
    },
  };
  return { dashboard, syncState, now: () => NOW };
}

describe('loadDashboard', () => {
  it('computes the metrics against the injected clock', async () => {
    const outcome = await loadDashboard(deps({ facts: [fact()] }));

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.computedFor).toBe('2026-09-09');
    expect(outcome.data.metrics.totals.reportedUnits).toBe(2);
  });

  it('counts records that have never been synchronized', async () => {
    // Every local record is pending: no backend exists yet
    // (docs/tech-stack.md §5). The metrics must be identical either way.
    const pendingOnly = await loadDashboard(
      deps({ facts: [fact()], sync: counts({ pending: 1 }) })
    );
    const synchronizedOnly = await loadDashboard(
      deps({ facts: [fact()], sync: counts({ synchronized: 1 }) })
    );

    expect(pendingOnly.status).toBe('loaded');
    expect(synchronizedOnly.status).toBe('loaded');
    if (pendingOnly.status !== 'loaded' || synchronizedOnly.status !== 'loaded') {
      return;
    }
    expect(pendingOnly.data.metrics).toEqual(synchronizedOnly.data.metrics);
  });

  it('reports the synchronization counts beside the metrics, not inside them', async () => {
    const outcome = await loadDashboard(
      deps({ facts: [fact()], sync: counts({ pending: 3, failed: 1 }) })
    );

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.sync?.byStatus.pending).toBe(3);
    expect(outcome.data.sync?.total).toBe(4);
    // Nothing in the metrics object mentions synchronization.
    expect(JSON.stringify(outcome.data.metrics)).not.toContain('pending');
  });

  it('still shows the metrics when the sync panel cannot be read', async () => {
    const outcome = await loadDashboard(
      deps({ facts: [fact()], sync: new Error('no sync_records table') })
    );

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.sync).toBeNull();
    expect(outcome.data.metrics.totals.observations).toBe(1);
  });

  it('fails with a reason when the local rows cannot be read', async () => {
    const outcome = await loadDashboard(
      deps({ facts: new Error('database is locked') })
    );

    expect(outcome).toEqual({ status: 'failed', reason: 'database is locked' });
  });

  it('loads an empty dashboard rather than failing when nothing was captured', async () => {
    const outcome = await loadDashboard(deps({ facts: [] }));

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.metrics.totals.observations).toBe(0);
  });
});

describe('toIsoDate', () => {
  it('formats in UTC, matching the timestamp convention', () => {
    expect(toIsoDate(new Date('2026-09-09T23:59:00.000Z'))).toBe('2026-09-09');
  });
});
