/**
 * Minimal read-only MBTiles reader.
 *
 * An `.mbtiles` file is a SQLite database (MBTiles 1.3 spec): a `tiles` table
 * of `(zoom_level, tile_column, tile_row, tile_data)` and a `metadata`
 * key/value table. The tiles here are produced by Planetiler from OpenFreeMap's
 * pipeline (`scripts/build-tiles.ts`) — gzip-compressed Mapbox Vector Tile
 * protobufs in the OpenMapTiles schema.
 *
 * `better-sqlite3` is a native dependency, but it stays inside `tileserver/`
 * and never reaches the mobile app — the same boundary reason `server/` keeps
 * `pg` to itself.
 *
 * MBTiles stores rows in **TMS** order (y axis flipped); the app and MapLibre
 * request **XYZ**. `getTile` does that one conversion and nothing else.
 */
import Database from 'better-sqlite3';

export interface MbtilesMetadata {
  minzoom: number;
  maxzoom: number;
  /** [west, south, east, north], if the file declares it. */
  bounds?: [number, number, number, number];
  /** [lon, lat, zoom], if the file declares it. */
  center?: [number, number, number];
  /** Vector-layer descriptors from the `json` metadata row, for a TileJSON response if ever needed. */
  vectorLayers: unknown[];
  format: string;
}

interface TileRow {
  tile_data: Buffer;
}

function readMetadata(db: Database.Database): MbtilesMetadata {
  const rows = db.prepare('SELECT name, value FROM metadata').all() as {
    name: string;
    value: string;
  }[];
  const map = new Map(rows.map((row) => [row.name, row.value]));

  const parseNumber = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const parseList = (value: string | undefined): number[] | undefined => {
    if (!value) return undefined;
    const parts = value.split(',').map((part) => Number(part.trim()));
    return parts.every((part) => Number.isFinite(part)) ? parts : undefined;
  };

  let vectorLayers: unknown[] = [];
  const json = map.get('json');
  if (json) {
    try {
      const parsed = JSON.parse(json) as { vector_layers?: unknown[] };
      if (Array.isArray(parsed.vector_layers)) vectorLayers = parsed.vector_layers;
    } catch {
      // A malformed `json` row is not fatal — tiles still serve without it.
    }
  }

  const bounds = parseList(map.get('bounds'));
  const center = parseList(map.get('center'));

  return {
    minzoom: parseNumber(map.get('minzoom'), 0),
    maxzoom: parseNumber(map.get('maxzoom'), 14),
    bounds: bounds && bounds.length === 4 ? (bounds as [number, number, number, number]) : undefined,
    center: center && center.length === 3 ? (center as [number, number, number]) : undefined,
    vectorLayers,
    format: map.get('format') ?? 'pbf',
  };
}

export class Mbtiles {
  readonly path: string;
  readonly metadata: MbtilesMetadata;
  #db: Database.Database;
  #getTileStatement: Database.Statement;

  constructor(path: string) {
    this.path = path;
    this.#db = new Database(path, { readonly: true, fileMustExist: true });
    this.#db.pragma('journal_mode = OFF');
    this.metadata = readMetadata(this.#db);
    this.#getTileStatement = this.#db.prepare(
      'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?'
    );
  }

  /**
   * Returns the raw tile blob for an **XYZ** coordinate, or `null` when the
   * file has no tile there. The blob is returned exactly as stored — usually
   * gzip-compressed; the caller decides how to send it.
   */
  getTile(z: number, x: number, y: number): Buffer | null {
    const tmsY = (1 << z) - 1 - y;
    const row = this.#getTileStatement.get(z, x, tmsY) as TileRow | undefined;
    return row ? row.tile_data : null;
  }

  close(): void {
    this.#db.close();
  }
}

/** `true` when a blob begins with the gzip magic bytes. */
export function isGzip(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}
