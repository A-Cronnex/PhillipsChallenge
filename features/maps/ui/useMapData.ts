import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../../../lib/container';
import {
  loadMapData,
  type MapViewData,
} from '../application/load-map-data';
import type { MappedSite } from '../domain/map-features';

export type MapScreenPhase = 'loading' | 'ready' | 'unavailable';

/**
 * Screen state for the map.
 *
 * Holds the loaded dataset and the selected site. Contains no SQL, no GeoJSON
 * construction and no MapLibre types — those belong to the repository, the
 * domain and the view respectively.
 */
export function useMapData() {
  const [phase, setPhase] = useState<MapScreenPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MapViewData | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const repositories = await getRepositories();
      const outcome = await loadMapData({
        mapData: repositories.mapData,
        mapRegions: repositories.mapRegions,
      });

      if (outcome.status === 'failed') {
        setError(outcome.reason);
        setPhase('unavailable');
        return;
      }

      setData(outcome.data);
      setPhase('ready');
      // Drop a selection that no longer exists after a reload.
      setSelectedSiteId((current) =>
        current && outcome.data.dataset.sites.some((s) => s.siteId === current)
          ? current
          : null
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase('unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSite: MappedSite | null =
    data?.dataset.sites.find((site) => site.siteId === selectedSiteId) ?? null;

  return {
    phase,
    error,
    data,
    selectedSiteId,
    selectedSite,
    selectSite: setSelectedSiteId,
    clearSelection: useCallback(() => setSelectedSiteId(null), []),
    reload: load,
  };
}
