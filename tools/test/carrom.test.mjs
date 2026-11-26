import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/lib/core/carrom.js';

const pocket = (s, pred, n = 1) => {
  // Mark n matching pieces as having fallen during the running shot.
  s.fell ??= [];
  for (const p of s.pieces.filter((q) => q.inPlay && pred(q)).slice(0, n)) { p.inPlay = false; s.fell.push(p); }
};

test('rack: queen, 9 white, 9 black, no overlaps', () => {
  const p = C.rack();
  assert.equal(p.filter((x) => x.color === 'white').length, 9);
  assert.equal(p.filter((x) => x.color === 'black').length, 9);
  assert.equal(p[0].kind, 'queen');
  for (let i = 0; i < p.length; i++) for (let k = i + 1; k < p.length; k++)
    assert.ok(Math.hypot(p[i].x - p[k].x, p[i].y - p[k].y) >= p[i].r + p[k].r);
});

test('own coin: shoot again; nothing: turn passes', () => {
  const s = C.newGame();
  s.fell = []; pocket(s, (q) => q.color === 'white');
  assert.equal(C.endShot(s).again, true);
  assert.equal(s.turn, 'white');
  s.fell = [];
  C.endShot(s);
  assert.equal(s.turn, 'black');
});

test('foul returns the pocketed own coin plus one penalty coin', () => {
  const s = C.newGame();
  s.fell = []; pocket(s, (q) => q.color === 'white', 2); C.endShot(s);
  assert.equal(s.pocketed.white, 2);
  s.fell = [{ kind: 'striker' }]; pocket(s, (q) => q.color === 'white');
  C.endShot(s);
  assert.equal(s.pocketed.white, 1);
  assert.equal(s.turn, 'black');
});

test('queen must be covered by the next coin', () => {
  const s = C.newGame();
  s.fell = []; pocket(s, (q) => q.color === 'white'); C.endShot(s);
  s.fell = []; pocket(s, (q) => q.kind === 'queen');
  assert.equal(C.endShot(s).again, true);
  assert.equal(s.queen.state, 'pending');
  s.fell = []; C.endShot(s);
  assert.equal(s.queen.state, 'board');
  assert.ok(s.pieces[0].inPlay);
});

test('the board is won after all coins and a covered queen', () => {
  const s = C.newGame();
  s.fell = []; pocket(s, (q) => q.color === 'white'); pocket(s, (q) => q.kind === 'queen'); C.endShot(s);
  assert.equal(s.queen.by, 'white');
  s.fell = []; pocket(s, (q) => q.color === 'white', 8); C.endShot(s);
  assert.equal(s.winner, 'white');
  assert.equal(s.points, 9 + 3);
});

test('a break shot moves the pack and comes to rest', () => {
  const s = C.newGame();
  C.startShot(s, C.CENTER, -Math.PI / 2, 1);
  let n = 0; while (C.tick(s) && n < 6000) n++;
  assert.ok(n < 6000);
  assert.ok(s.pieces.some((p) => Math.hypot(p.x - C.CENTER, p.y - C.CENTER) > 120));
});

test('easy rack: queen and 3 coins per colour', () => {
  const p = C.rack({ easy: true });
  assert.equal(p.length, 7);
  assert.equal(p.filter((x) => x.color === 'white').length, 3);
  assert.equal(p.filter((x) => x.color === 'black').length, 3);
  assert.equal(C.coinsOf(C.newGame({ easy: true })), 3);
});

test('easy: a pocketed striker returns nothing and ends the turn', () => {
  const s = C.newGame({ easy: true });
  s.fell = [{ kind: 'striker' }]; pocket(s, (q) => q.color === 'white');
  const r = C.endShot(s);
  assert.equal(s.pocketed.white, 1);
  assert.equal(r.again, false);
  assert.equal(s.turn, 'black');
});

test('easy: the queen counts at once and the first to clear wins', () => {
  const s = C.newGame({ easy: true });
  s.fell = []; pocket(s, (q) => q.kind === 'queen');
  assert.equal(C.endShot(s).again, true);
  assert.equal(s.queen.by, 'white');
  s.fell = []; pocket(s, (q) => q.color === 'black'); C.endShot(s);
  assert.equal(s.turn, 'black');
  s.fell = []; pocket(s, (q) => q.color === 'black', 2); C.endShot(s);
  assert.equal(s.winner, 'black');
  assert.equal(s.points, 3);
});

test('easy computer returns a valid shot', () => {
  const s = C.newGame({ easy: true });
  const shot = C.chooseShot(s, { simple: true });
  assert.ok(Number.isFinite(shot.angle) && shot.power > 0 && shot.power <= 1);
  assert.ok(C.strikerFree(s, shot.x, s.turn));
});
