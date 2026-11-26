import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, seriesWinner, parseScore } from '../../src/lib/core/pcl.js';
import { loadModel } from '../load.mjs';

test('score parsing', () => {
  assert.deepEqual(parseScore('25:11'), [25, 11]);
  assert.equal(parseScore('25-11'), null);
});

test('best of three', () => {
  assert.equal(seriesWinner(['19:17', '16:25', '25:0'], 3), 0);
  assert.equal(seriesWinner(['1:25', '7:25'], 3), 1);
  assert.equal(seriesWinner(['25:0'], 3), null);
  assert.equal(seriesWinner(['24:18'], 1), 0);
});

test('head-to-head breaks a tie on points and difference', () => {
  const m = [
    { a: 'x', b: 'y', sa: 20, sb: 10 },
    { a: 'y', b: 'z', sa: 20, sb: 10 },
    { a: 'z', b: 'x', sa: 20, sb: 10 },
    { a: 'x', b: 'w', sa: 10, sb: 0 },
    { a: 'y', b: 'w', sa: 10, sb: 0 },
  ];
  const t = standings(['x', 'y', 'z', 'w'], m);
  assert.equal(t.at(-1).player, 'w');
});

test('PCL 2026: table and playoff match the real sheet and playoff page', () => {
  const s = loadModel({ today: new Date('2026-11-26') }).seasons['pcl/2026'];
  assert.equal(s.matches.length, 45);
  assert.deepEqual(s.table.slice(0, 8).map((r) => r.player), [
    'zdenek-svitak', 'ajay-sekhesh', 'frantisek-cervenka', 'frantisek-rezek',
    'lukas-navratil', 'jan-tesitel', 'neel-vasanth', 'tomas-chmelar',
  ]);
  const g = s.groups[0];
  const by = Object.fromEntries(g.slots.map((x) => [x.id, x]));
  assert.equal(by.f1.players[0].player, 'zdenek-svitak');
  assert.equal(by.f1.players[1].player, 'frantisek-cervenka');
  assert.equal(by.f5.players[0].player, 'tomas-chmelar');
  assert.equal(g.next, 'l-sf2');
  assert.equal(s.complete, false);
});
