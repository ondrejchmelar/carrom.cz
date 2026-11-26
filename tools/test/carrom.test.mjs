import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/lib/core/carrom.js';

// A game after the break, so the rules tests start in open play.
const fresh = (o) => Object.assign(C.newGame(o), { broken: true });

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
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white');
  assert.equal(C.endShot(s).again, true);
  assert.equal(s.turn, 'white');
  s.fell = [];
  C.endShot(s);
  assert.equal(s.turn, 'black');
});

test('striker with own coin: that coin and one due go back, you play on (L58)', () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white', 2); C.endShot(s);
  assert.equal(s.pocketed.white, 2);
  s.fell = [{ kind: 'striker' }]; pocket(s, (q) => q.color === 'white');
  C.endShot(s);
  assert.equal(s.pocketed.white, 1);
  assert.equal(s.turn, 'white');
});

test('striker alone: one due, turn ends; owed until you have a coin (L56, L57)', () => {
  const s = fresh();
  s.fell = [{ kind: 'striker' }]; C.endShot(s);
  assert.equal(s.turn, 'black'); assert.equal(s.dues.white, 1);
  s.turn = 'white'; s.fell = []; pocket(s, (q) => q.color === 'white'); C.endShot(s);
  assert.equal(s.pocketed.white, 0); assert.equal(s.dues.white, 0);
});

test("opponent's coin is no foul; their last coin with the queen on the board loses you the board (L28, L96)", () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'black'); const r = C.endShot(s);
  assert.equal(r.foul, false); assert.equal(s.pocketed.black, 1); assert.equal(s.turn, 'black');
  s.turn = 'white'; s.fell = []; pocket(s, (q) => q.color === 'black', 8); C.endShot(s);
  assert.equal(s.winner, 'black'); assert.equal(s.points, 9 + 3); assert.equal(s.reason, 'last-their');
});

test('own last coin before the queen loses the board by 3 (L97)', () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white', 9); C.endShot(s);
  assert.equal(s.winner, 'black'); assert.equal(s.points, 3);
});

test('break: three attempts to touch a coin, then it passes (L24, L25)', () => {
  const s = C.newGame();
  for (let i = 0; i < 2; i++) { s.fell = []; C.endShot(s); assert.equal(s.turn, 'white'); }
  s.fell = []; C.endShot(s);
  assert.equal(s.turn, 'black');
});

test('queen must be covered by the next coin', () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white'); C.endShot(s);
  s.fell = []; pocket(s, (q) => q.kind === 'queen');
  assert.equal(C.endShot(s).again, true);
  assert.equal(s.queen.state, 'pending');
  s.fell = []; C.endShot(s);
  assert.equal(s.queen.state, 'board');
  assert.ok(s.pieces[0].inPlay);
});

test('the board is won after all coins and a covered queen', () => {
  const s = fresh();
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

test('easy: striker with your coin: the coin counts and you play on; striker alone ends the turn', () => {
  const s = fresh({ easy: true });
  s.fell = [{ kind: 'striker' }]; pocket(s, (q) => q.color === 'white');
  const r = C.endShot(s);
  assert.equal(s.pocketed.white, 1);
  assert.equal(r.again, true);
  assert.equal(s.turn, 'white');
  s.fell = [{ kind: 'striker' }]; C.endShot(s);
  assert.equal(s.pocketed.white, 1);
  assert.equal(s.turn, 'black');
});

test('easy: no win while the queen is on the board, the last coin comes back', () => {
  const s = fresh({ easy: true });
  s.fell = []; pocket(s, (q) => q.color === 'white', 3); const r = C.endShot(s);
  assert.equal(s.winner, null);
  assert.equal(s.pocketed.white, 2);
  assert.equal(s.turn, 'black');
  assert.equal(r.msg[0], 'queen-first');
});

test('easy: the queen counts at once and the first to clear wins', () => {
  const s = fresh({ easy: true });
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

test('a pocketed striker never counts as a coin', () => {
  for (const easy of [false, true]) {
    const s = fresh({ easy });
    C.startShot(s, C.CENTER, -Math.PI / 2, 0.1);
    s.fell = [s.striker];
    C.endShot(s);
    assert.equal(s.pocketed.white, 0);
    assert.equal(s.winner, null);
  }
});

test('full rules: striker foul after a coin costs that coin', () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white'); C.endShot(s);
  C.startShot(s, C.CENTER, -Math.PI / 2, 0.1);
  s.fell = [s.striker];
  C.endShot(s);
  assert.equal(s.pocketed.white, 0);
});

test('aiming guide: straight up from the centre hits a coin and pushes it on', () => {
  const s = C.newGame();
  const pr = C.predictShot(s, C.CENTER, -Math.PI / 2);
  assert.ok(pr.coins.length >= 1);
  assert.ok(pr.striker.to[1] < C.BASE_Y.bottom && pr.striker.to[1] > C.CENTER);
  assert.ok(pr.coins[0].to[1] < pr.coins[0].from[1]);
});
