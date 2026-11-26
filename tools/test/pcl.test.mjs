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
  assert.equal(by.f1.players[1].player, 'ajay-sekhesh'); // SF2 went to Sekhesh (Ondrej, 2026-11-26)
  assert.equal(by.f3.players[1].player, 'frantisek-cervenka');
  assert.equal(by.f5.players[0].player, 'tomas-chmelar');
  assert.equal(g.next, 'l-sf2');
  assert.equal(s.complete, false);
  // only 10 players: 9th and 10th play one match (playoff2026.html, group B)
  const mini = s.groups[1].slots[0];
  assert.deepEqual(mini.players.map((p) => p.player), ['michal-fucik', 'pavel-schierl']);
  assert.equal(mini.winner, 0);
});

test('PCL 2017–2025: brackets from the old pages agree with the published final places', () => {
  const M = loadModel({ today: new Date('2026-11-26') });
  for (let y = 2017; y <= 2025; y++) {
    const s = M.seasons[`pcl/${y}`];
    const stored = Object.fromEntries(M.editions[`pcl/${y}`].results.singles.map((r) => [r.place, r.player]));
    assert.ok(s.groups.length > 0 && s.groups.every((g) => g.complete), `${y}: bracket incomplete`);
    for (const p of s.groups.flatMap((g) => g.places)) assert.equal(p.player, stored[p.place], `${y}: place ${p.place}`);
  }
  // scores are in bracket order: QF2 2024 was Rezek (5) v Raj (4), Raj won 2:1
  const qf2 = M.seasons['pcl/2024'].groups[0].slots.find((x) => x.id === 'qf2');
  assert.deepEqual(qf2.games, [[8, 25], [21, 8], [8, 25]]);
  assert.equal(qf2.players[qf2.winner].player, 'raj-patil');
});
