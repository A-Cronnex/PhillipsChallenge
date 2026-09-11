import { useCallback, useEffect, useRef, useState } from 'react';

import { getRepositories } from '../../../lib/container';
import {
  loadMapData,
  type MapViewData,
} from '../application/load-map-data';
import { startRegionDownload } from '../application/download-region';
import { PREDEFINED_REGIONS } from '../domain/predefined-regions';
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  /** Re-reads only the region rows — cheap, and safe to call on a timer while a download is in flight. */
  const refreshRegions = useCallback(async () => {
    const repositories = await getRepositories();
    const regions = await repositories.mapRegions.listRegions();
    setData((current) => (current ? { ...current, regions } : current));
  }, []);

  // While any region is downloading, poll its row for progress. MapLibre's
  // OfflineManager reports progress natively; going through the database
  // (rather than threading a live callback up from the service) keeps this
  // hook's only source of truth the same one the rest of the screen reads,
  // and survives the screen unmounting mid-download.
  useEffect(() => {
    const downloading = data?.regions.some((region) => region.status === 'downloading') ?? false;

    if (downloading && !pollRef.current) {
      pollRef.current = setInterval(() => void refreshRegions(), 1000);
    } else if (!downloading && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data?.regions, refreshRegions]);

  const downloadRegion = useCallback(
    async (regionId: string) => {
      const region = PREDEFINED_REGIONS.find((candidate) => candidate.id === regionId);
      if (!region) return;
      const repositories = await getRepositories();
      await startRegionDownload(region, { mapRegions: repositories.mapRegions });
      await refreshRegions();
    },
    [refreshRegions]
  );

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
    downloadRegion,
  };
}
