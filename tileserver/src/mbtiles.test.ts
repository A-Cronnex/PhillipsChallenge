/**
 * Run with `npm test` (node --test) from `tileserver/`.
 *
 * Builds a tiny MBTiles fixture in a temp dir with better-sqlite3's write API,
 * then reads it back through `Mbtiles` — the point is the TMS↔XYZ row flip and
 * the metadata parsing, the two things that are easy to get subtly wrong.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { after, before, test } from 'node:test';

import Database from 'better-sqlite3';

// `.ts` extension: this file runs under `node --test --experimental-strip-types`
// (ESM, explicit extensions required), not through the CommonJS `tsc` build,
// which excludes `*.test.ts`.
import { isGzip, Mbtiles } from './mbtiles.ts';

let dir: string;
let fixturePath: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'mbtiles-test-'));
  fixturePath = join(dir, 'fixture.mbtiles');

  const db = new Database(fixturePath);
  db.exec(
    'CREATE TABLE metadata (name TEXT, value TEXT);' +
      'CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);'
  );
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('minzoom', '0');
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('maxzoom', '14');
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('format', 'pbf');
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('bounds', '-80,8,-40,6');
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run(
    'json',
    JSON.stringify({ vector_layers: [{ id: 'transportation' }, { id: 'water' }] })
  );

  // At z2, XYZ y=1 is TMS tile_row = (1<<2) - 1 - 1 = 2. Store the tile at
  // TMS row 2 so a correct reader returns it for XYZ (2, 1, 1).
  db.prepare('INSERT INTO tiles VALUES (?, ?, ?, ?)').run(2, 1, 2, gzipSync(Buffer.from('tile-2-1-1')));
  db.close();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('parses metadata', () => {
  const mbtiles = new Mbtiles(fixturePath);
  assert.equal(mbtiles.metadata.minzoom, 0);
  assert.equal(mbtiles.metadata.maxzoom, 14);
  assert.equal(mbtiles.metadata.format, 'pbf');
  assert.deepEqual(mbtiles.metadata.bounds, [-80, 8, -40, 6]);
  assert.equal(mbtiles.metadata.vectorLayers.length, 2);
  mbtiles.close();
});

test('getTile converts XYZ to the flipped TMS row', () => {
  const mbtiles = new Mbtiles(fixturePath);
  const tile = mbtiles.getTile(2, 1, 1);
  assert.ok(tile, 'expected a tile at XYZ (2, 1, 1)');
  assert.equal(gunzipSync(tile!).toString(), 'tile-2-1-1');
  mbtiles.close();
});

test('getTile returns the stored blob untouched', () => {
  const mbtiles = new Mbtiles(fixturePath);
  const tile = mbtiles.getTile(2, 1, 1)!;
  assert.ok(isGzip(tile), 'stored blob should still be gzip-wrapped');
  mbtiles.close();
});

test('getTile returns null where there is no tile', () => {
  const mbtiles = new Mbtiles(fixturePath);
  assert.equal(mbtiles.getTile(2, 0, 0), null);
  assert.equal(mbtiles.getTile(9, 5, 5), null);
  mbtiles.close();
});

test('isGzip only matches the gzip magic bytes', () => {
  assert.equal(isGzip(Buffer.from([0x1f, 0x8b, 0x08])), true);
  assert.equal(isGzip(Buffer.from([0x78, 0x9c])), false);
  assert.equal(isGzip(Buffer.from([])), false);
});
