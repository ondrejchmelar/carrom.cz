import test from 'node:test';
import assert from 'node:assert/strict';
import { editionPoints, linearPoints } from '../../src/lib/core/mcr.js';
import { loadModel } from '../load.mjs';

test('millesimal: winner 1000, last 1', () => {
  assert.equal(linearPoints(1, 10, 1000), 1000);
  assert.equal(linearPoints(10, 10, 1000), 1);
  assert.equal(Math.round(linearPoints(2, 10, 1000)), 889);
});

test('shared place gets the average', () => {
  const p = editionPoints([{ place: 1, player: 'a' }, { place: 2, player: 'b' }, { place: 2, player: 'c' }, { place: 4, player: 'd' }], 100);
  assert.equal(p.get('b'), p.get('c'));
  assert.equal(p.get('b'), (linearPoints(2, 4, 100) + linearPoints(3, 4, 100)) / 2);
});

test('MČR 2025: published table, Karlos Novák is champion with 200', () => {
  const r = loadModel().rankings['mcr-2025'];
  assert.equal(r.table.rows[0].player, 'karlos-novak');
  assert.equal(r.table.rows[0].total, 200);
  const druhy = r.check.find((c) => c.edition === 'druhy/2025');
  assert.equal(druhy.status, 'ok');
});
