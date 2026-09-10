import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../../../lib/container';
import {
  loadDashboard,
  type DashboardData,
} from '../application/load-dashboard';

export type DashboardPhase = 'loading' | 'ready' | 'unavailable';

/**
 * Screen state for the dashboard.
 *
 * Holds no rules of its own: every number comes from the domain and every read
 * from a repository. This hook only decides which of the four states
 * (loading, ready, empty, error) the screen is in, and exposes a reload —
 * the metrics are a snapshot of local rows, so returning to the tab after
 * capturing something must be able to recompute them.
 */
export function useDashboard(now: () => Date = () => new Date()) {
  const [phase, setPhase] = useState<DashboardPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    // Keep current data mounted while refreshing (including the last sync report).
    setError(null);
    try {
      const repositories = await getRepositories();
      const outcome = await loadDashboard({
        dashboard: repositories.dashboard,
        syncState: repositories.syncState,
        now,
      });

      if (outcome.status === 'failed') {
        setError(outcome.reason);
        setPhase('unavailable');
        return;
      }

      setData(outcome.data);
      setPhase('ready');
    } catch (caught) {
      // Opening the database can fail on first launch (migration, storage).
      // The message is surfaced rather than swallowed, with a retry.
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase('unavailable');
    }
    // `now` is a stable injected clock in practice; listing it would rebuild
    // the callback on every render when a caller passes an inline arrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { phase, error, data, reload: load };
}
