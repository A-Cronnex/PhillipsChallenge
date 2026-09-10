// services/maps/offline-regions.ts imports the real native module, which
// binds to native code and cannot be parsed under Jest (see
// tests/features/maps/offline-regions.test.ts, which needs this same guard).
jest.mock('@maplibre/maplibre-react-native', () => ({ OfflineManager: {} }));

import { startRegionDownload } from '../../../features/maps/application/download-region';
import type { PredefinedRegion } from '../../../features/maps/domain/predefined-regions';
import type { MapRegion, MapRegionRepository } from '../../../features/maps/application/ports';
import type { OfflineManagerLike } from '../../../services/maps/offline-regions';

const REGION: PredefinedRegion = {
  id: 'region-panama-city',
  name: 'Ciudad de Panamá',
  bounds: [-79.6, 8.93, -79.44, 9.04],
  minZoom: 9,
  maxZoom: 15,
};

const SELF_HOSTED = {
  mode: 'self_hosted_style' as const,
  styleUrl: 'https://tiles.internal.example.org/style.json',
};

/** In-memory `MapRegionRepository` that records every write, keyed by id. */
function fakeMapRegions() {
  const rows = new Map<string, MapRegion>();
  const repository: MapRegionRepository = {
    async listRegions() {
      return [...rows.values()];
    },
    async upsertRegion(region) {
      rows.set(region.id, region);
    },
    async updateRegionStatus(id, update) {
      const existing = rows.get(id);
      if (!existing) throw new Error(`no such region: ${id}`);
      rows.set(id, {
        ...existing,
        status: update.status,
        progress: update.progress,
        lastError: update.lastError ?? existing.lastError,
        sizeBytes: update.sizeBytes ?? existing.sizeBytes,
        downloadedAt: update.downloadedAt ?? existing.downloadedAt,
      });
    },
  };
  return { repository, rows };
}

function fakeManager() {
  let progressCb: ((pack: unknown, s: { percentage?: number }) => void) | null = null;
  let errorCb: ((pack: unknown, e: { message?: string }) => void) | null = null;
  const impl: OfflineManagerLike = {
    async createPack(_options, onProgress, onError) {
      progressCb = onProgress;
      errorCb = onError;
      return {};
    },
  };
  return {
    impl,
    emitProgress: (pct: number) => progressCb?.({}, { percentage: pct }),
    emitError: (message: string) => errorCb?.({}, { message }),
  };
}

describe('startRegionDownload', () => {
  it('writes the region as downloading before the download starts', async () => {
    const { repository, rows } = fakeMapRegions();
    const manager = fakeManager();

    await startRegionDownload(REGION, {
      mapRegions: repository,
      manager: manager.impl,
      config: SELF_HOSTED,
    });

    expect(rows.get(REGION.id)).toMatchObject({ status: 'downloading', progress: 0 });
  });

  it('mirrors progress into the region row as it arrives', async () => {
    const { repository, rows } = fakeMapRegions();
    const manager = fakeManager();

    await startRegionDownload(REGION, {
      mapRegions: repository,
      manager: manager.impl,
      config: SELF_HOSTED,
    });
    manager.emitProgress(55);

    expect(rows.get(REGION.id)).toMatchObject({ status: 'downloading', progress: 0.55 });
  });

  it('marks the region downloaded, with a timestamp, at 100%', async () => {
    const { repository, rows } = fakeMapRegions();
    const manager = fakeManager();
    const now = () => new Date('2026-09-10T00:00:00.000Z');

    await startRegionDownload(REGION, {
      mapRegions: repository,
      manager: manager.impl,
      config: SELF_HOSTED,
      now,
    });
    manager.emitProgress(100);

    expect(rows.get(REGION.id)).toMatchObject({
      status: 'downloaded',
      progress: 1,
      downloadedAt: '2026-09-10T00:00:00.000Z',
    });
  });

  it('records a failure from the manager without losing the region row', async () => {
    const { repository, rows } = fakeMapRegions();
    const manager = fakeManager();

    await startRegionDownload(REGION, {
      mapRegions: repository,
      manager: manager.impl,
      config: SELF_HOSTED,
    });
    manager.emitError('disk full');

    expect(rows.get(REGION.id)).toMatchObject({ status: 'failed', lastError: 'disk full' });
  });

  it('marks the region failed, not silently skipped, when no basemap is configured', async () => {
    const { repository, rows } = fakeMapRegions();
    const manager = fakeManager();

    await startRegionDownload(REGION, {
      mapRegions: repository,
      manager: manager.impl,
      config: { mode: 'none' },
    });

    expect(rows.get(REGION.id)).toMatchObject({ status: 'failed' });
    expect(rows.get(REGION.id)?.lastError).toMatch(/teselas/);
  });
});
