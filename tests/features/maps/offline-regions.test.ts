import {
  DEFAULT_MAX_ZOOM,
  DEFAULT_MIN_ZOOM,
  canDownloadRegions,
  downloadRegion,
  type OfflineManagerLike,
} from '../../../services/maps/offline-regions';

jest.mock('@maplibre/maplibre-react-native', () => ({ OfflineManager: {} }));

const SELF_HOSTED = {
  mode: 'self_hosted_style' as const,
  styleUrl: 'https://tiles.internal.example.org/style.json',
};

function manager() {
  const calls: unknown[] = [];
  let progressCb: ((pack: unknown, s: { percentage?: number }) => void) | null = null;
  let errorCb: ((pack: unknown, e: { message?: string }) => void) | null = null;

  const impl: OfflineManagerLike = {
    async createPack(options, onProgress, onError) {
      calls.push(options);
      progressCb = onProgress;
      errorCb = onError;
      return {};
    },
  };
  return {
    impl,
    calls,
    emitProgress: (pct: number) => progressCb?.({}, { percentage: pct }),
    emitError: (message: string) => errorCb?.({}, { message }),
  };
}

describe('canDownloadRegions', () => {
  it('is unavailable when no basemap is configured — there are no tiles to fetch', () => {
    expect(canDownloadRegions({ mode: 'none' })).toMatchObject({
      status: 'unavailable',
      reason: 'no_basemap',
    });
  });

  it('is available for a self-hosted style', () => {
    expect(canDownloadRegions(SELF_HOSTED)).toEqual({ status: 'available' });
  });

  it('is unavailable for a third-party provider, not merely rejected later', () => {
    expect(
      canDownloadRegions({
        mode: 'self_hosted_style',
        styleUrl: 'https://api.maptiler.com/style.json',
      })
    ).toMatchObject({ status: 'unavailable', reason: 'invalid_style' });
  });
});

describe('downloadRegion', () => {
  const request = {
    id: 'r1',
    name: 'Panamá',
    bounds: [-83, 7, -77, 10] as [number, number, number, number],
  };

  it('refuses to start when no basemap is configured', async () => {
    const m = manager();
    const outcome = await downloadRegion(request, {
      manager: m.impl,
      config: { mode: 'none' },
      onProgress: () => {},
      onError: () => {},
    });

    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'no_basemap' });
    expect(m.calls).toHaveLength(0);
  });

  it('starts a pack with the region bounds and the self-hosted style', async () => {
    const m = manager();
    const outcome = await downloadRegion(request, {
      manager: m.impl,
      config: SELF_HOSTED,
      onProgress: () => {},
      onError: () => {},
    });

    expect(outcome).toEqual({ status: 'started' });
    expect(m.calls[0]).toMatchObject({
      mapStyle: SELF_HOSTED.styleUrl,
      bounds: request.bounds,
      minZoom: DEFAULT_MIN_ZOOM,
      maxZoom: DEFAULT_MAX_ZOOM,
      metadata: { regionId: 'r1', name: 'Panamá' },
    });
  });

  it('reports progress as a 0-1 fraction', async () => {
    const m = manager();
    const seen: number[] = [];
    await downloadRegion(request, {
      manager: m.impl,
      config: SELF_HOSTED,
      onProgress: (p) => seen.push(p.progress),
      onError: () => {},
    });

    m.emitProgress(42);
    expect(seen).toEqual([0.42]);
  });

  it('flags completion at 100%', async () => {
    const m = manager();
    let completed = false;
    await downloadRegion(request, {
      manager: m.impl,
      config: SELF_HOSTED,
      onProgress: (p) => {
        completed = p.completed;
      },
      onError: () => {},
    });

    m.emitProgress(100);
    expect(completed).toBe(true);
  });

  it('clamps a progress value outside the expected range', async () => {
    const m = manager();
    const seen: number[] = [];
    await downloadRegion(request, {
      manager: m.impl,
      config: SELF_HOSTED,
      onProgress: (p) => seen.push(p.progress),
      onError: () => {},
    });

    m.emitProgress(140);
    m.emitProgress(-10);
    expect(seen).toEqual([1, 0]);
  });

  it('surfaces a download failure so it can be persisted and retried', async () => {
    const m = manager();
    let message: string | null = null;
    await downloadRegion(request, {
      manager: m.impl,
      config: SELF_HOSTED,
      onProgress: () => {},
      onError: (msg) => {
        message = msg;
      },
    });

    m.emitError('disk full');
    expect(message).toBe('disk full');
  });

  it('honours an explicit zoom range', async () => {
    const m = manager();
    await downloadRegion(
      { ...request, minZoom: 10, maxZoom: 12 },
      { manager: m.impl, config: SELF_HOSTED, onProgress: () => {}, onError: () => {} }
    );

    expect(m.calls[0]).toMatchObject({ minZoom: 10, maxZoom: 12 });
  });
});
