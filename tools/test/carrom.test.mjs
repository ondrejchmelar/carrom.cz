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

test('easy: the queen needs covering, and the first to clear wins', () => {
  const s = fresh({ easy: true });
  s.fell = []; pocket(s, (q) => q.kind === 'queen');
  assert.equal(C.endShot(s).again, true);
  assert.equal(s.queen.state, 'pending');
  s.fell = []; C.endShot(s);
  assert.equal(s.queen.state, 'board'); assert.ok(s.pieces[0].inPlay);
  s.turn = 'white'; s.fell = []; pocket(s, (q) => q.kind === 'queen'); pocket(s, (q) => q.color === 'white'); C.endShot(s);
  assert.equal(s.queen.state, 'covered'); assert.equal(s.queen.by, 'white');
  s.pocketed.white = 0; s.pieces.filter((q) => q.color === 'white').forEach((q) => (q.inPlay = true));
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

test('striker over a red base circle: all of it or none of it (law 118), not on Easy', () => {
  const s = fresh();
  assert.ok(C.strikerFree(s, 151));          // covers the circle
  assert.ok(!C.strikerFree(s, 170));         // half on it
  assert.ok(C.strikerFree(s, 190));          // clear of it
  assert.equal(C.snapStrikerX(s, 170, 1), C.snapStrikerX(s, 170, 1));
  assert.ok(C.snapStrikerX(s, 170, 1) > 186 && C.snapStrikerX(s, 170, -1) < 156);
  const e = fresh({ easy: true });
  assert.ok(C.strikerFree(e, 170));
});

test('striker moves forward or back to fit beside a coin on the base line (law 117)', () => {
  const s = fresh();
  const c = s.pieces[1];
  Object.assign(c, { x: 370, y: C.BASE_Y.bottom - 34 }); // just in front, overlapping the striker spot slightly
  const y = C.strikerSpot(s, 370);
  const [lo, hi] = C.strikerYRange(s);
  assert.ok(y !== null && y > C.BASE_Y.bottom && y <= hi && y >= lo);
  Object.assign(c, { y: C.BASE_Y.bottom }); // right on the line: no room
  assert.equal(C.strikerSpot(s, 370), null);
});

test('game to 25 points or 8 boards, draw if level after 8 (law 39)', () => {
  assert.equal(C.matchWinner({ me: 24, other: 10 }, 5), null);
  assert.equal(C.matchWinner({ me: 26, other: 10 }, 5), 'me');
  assert.equal(C.matchWinner({ me: 12, other: 14 }, 8), 'other');
  assert.equal(C.matchWinner({ me: 12, other: 12 }, 8), 'draw');
  assert.equal(C.matchWinner({ me: 10, other: 3 }, 4, true), 'me');
});

test('from 22 points the queen adds nothing (law 37)', () => {
  const s = Object.assign(C.newGame({ score: { white: 22, black: 0 } }), { broken: true });
  s.fell = []; pocket(s, (q) => q.color === 'white'); pocket(s, (q) => q.kind === 'queen'); C.endShot(s);
  s.fell = []; pocket(s, (q) => q.color === 'white', 8); C.endShot(s);
  assert.equal(s.winner, 'white'); assert.equal(s.points, 9);
});

test('last own coin + queen + striker in one stroke: queen, coin and a due go back, you play on (L89)', () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white', 8); C.endShot(s);
  assert.equal(s.winner, null);
  s.fell = [{ kind: 'striker' }]; pocket(s, (q) => q.color === 'white'); pocket(s, (q) => q.kind === 'queen');
  const r = C.endShot(s);
  assert.equal(s.winner, null);
  assert.equal(r.again, true);
  assert.equal(s.pocketed.white, 7);
  assert.ok(s.pieces[0].inPlay);
});

test('last own coin + queen without striker: queen covered, board won (L87)', () => {
  const s = fresh();
  s.fell = []; pocket(s, (q) => q.color === 'white', 8); C.endShot(s);
  s.fell = []; pocket(s, (q) => q.color === 'white'); pocket(s, (q) => q.kind === 'queen'); C.endShot(s);
  assert.equal(s.winner, 'white'); assert.equal(s.points, 9 + 3);
});

test('returned coins go inside the outer circle, off the centre circle; the queen on the centre (L70, L76, L80)', () => {
  const s = fresh();
  for (const p of s.pieces) p.inPlay = false;
  s.pocketed.white = 9; s.pocketed.black = 9;
  s.queen = { state: 'pending', by: 'white' }; s.dues.white = 0;
  s.fell = [{ kind: 'striker' }]; s.turn = 'white';
  C.endShot(s); // pending queen not covered on a foul: queen back, one due back
  const q = s.pieces[0], coin = s.pieces.find((p) => p.kind === 'coin' && p.inPlay);
  assert.ok(Math.hypot(q.x - C.CENTER, q.y - C.CENTER) < 0.01);
  const d = Math.hypot(coin.x - C.CENTER, coin.y - C.CENTER);
  assert.ok(d >= 15.9 + coin.r && d <= 85 - coin.r, `coin at ${d}`);
});

test('a coin that is too fast does not drop into the pocket', () => {
  const run = (speed) => {
    const s = fresh();
    for (const p of s.pieces) p.inPlay = false;
    const c = s.pieces[1]; Object.assign(c, { inPlay: true, x: 200, y: 200, vx: -speed * Math.SQRT1_2, vy: -speed * Math.SQRT1_2 });
    let fell = false;
    for (let i = 0; i < 2000 && !fell; i++) { const f = C.step(s.pieces); if (f.includes(c)) fell = true; }
    return { fell, x: c.x, y: c.y, fast: Math.hypot(c.vx, c.vy) };
  };
  assert.equal(run(900).fell, true);
  const fast = C.step; // keep linter quiet
  const s = fresh();
  for (const p of s.pieces) p.inPlay = false;
  const c = s.pieces[1]; Object.assign(c, { inPlay: true, x: 60, y: 60, vx: -3500, vy: -3500 });
  const f = fast(s.pieces, 1 / 240);
  assert.equal(f.includes(c), false);
});
