// Carrom game engine: board geometry, physics, simplified ICF rules and a computer opponent.
// Pure JS without DOM, so the browser game and node tests share it. Units: millimetres, seconds.

export const BOARD = 740;               // playing surface 74 × 74 cm
export const POCKET_R = 22.25;          // pocket Ø 44.5 mm
export const COIN_R = 15.9;             // coin Ø 31.8 mm
export const STRIKER_R = 20.6;          // striker Ø 41.3 mm
export const CENTER = BOARD / 2;
export const BASE_Y = { bottom: BOARD - 118, top: 118 }; // striker centre on the base line
export const BASE_X = [151, BOARD - 151];                 // allowed striker centre range
export const MAX_SPEED = 5000;          // mm/s for a full-power break
// A powdered board is slick: pieces slow down evenly (dry friction, μ ≈ 0.08) and glide a long way,
// with no extra drag at speed. A firm 2 m/s shot rolls about 2.5 m before it stops.
export const FRICTION = 780;            // mm/s² sliding deceleration
const E_BALL = 0.9, E_WALL = 0.72;      // restitution
const MASS = { coin: 5.5, queen: 5.5, striker: 15 };
const STOP = 6;                         // mm/s below which a piece is at rest
const DT = 1 / 240;

export const POCKETS = [
  [POCKET_R, POCKET_R], [BOARD - POCKET_R, POCKET_R],
  [POCKET_R, BOARD - POCKET_R], [BOARD - POCKET_R, BOARD - POCKET_R],
];

/**
 * Piece and pocket sizes. The full game uses ICF sizes. The easy game uses the proportions of the
 * drawn board on the home page (Board.astro: 322 units wide, coin r 11, striker r 14.5, pocket r 17
 * centred 23 from the edges), so coins, striker and pockets are about 1.6× bigger.
 */
const HOME = BOARD / 322;
const FULL_GEOM = { coin: COIN_R, striker: STRIKER_R, pocket: POCKET_R, pockets: POCKETS };
const EP = 23 * HOME;
const EASY_GEOM = {
  coin: 11 * HOME, striker: 14.5 * HOME, pocket: 17 * HOME,
  pockets: [[EP, EP], [BOARD - EP, EP], [EP, BOARD - EP], [BOARD - EP, BOARD - EP]],
};
export const geom = (state) => (state?.easy ? EASY_GEOM : FULL_GEOM);

const other = (c) => (c === 'white' ? 'black' : 'white');

/**
 * Starting position: queen in the centre, 6 coins around it, 12 in the outer ring (hexagonal packing).
 * The easy game uses only the queen and the inner ring: 7 pieces, 3 coins per colour.
 */
export function rack({ easy = false, rand = Math.random, jitter = 0.06 } = {}) {
  const R = geom({ easy }).coin;
  const pieces = [{ id: 0, kind: 'queen', color: 'queen', x: CENTER, y: CENTER }];
  const d = R * 2 + 0.2;
  // Colours alternate in both rings. One ray points at the far-left pocket (top left, seen by white),
  // and both coins on it are white: inner ring W B W B W B, outer ring corners white, edges black.
  const ray = Math.atan2(-1, -1);
  let id = 1;
  const put = (a, dist, color) => pieces.push({ id: id++, kind: 'coin', color, x: CENTER + Math.cos(a) * dist, y: CENTER + Math.sin(a) * dist });
  for (let k = 0; k < 6; k++) put(ray + (k * Math.PI) / 3, d, k % 2 ? 'black' : 'white');
  for (let k = 0; k < 6 && !easy; k++) {
    put(ray + (k * Math.PI) / 3, 2 * d, 'white');
    put(ray + (k * Math.PI) / 3 + Math.PI / 6, Math.sqrt(3) * d, 'black');
  }
  // Hands never set a rack perfectly: leave small, uneven gaps between the coins (each coin sits a
  // little further out, by up to jitter × R per ring, and slightly to the side), never turned.
  // Then push apart any that overlap. So the same break does not always end the same way.
  const J = jitter * R;
  for (const p of pieces) {
    const dx = p.x - CENTER, dy = p.y - CENTER, dist = Math.hypot(dx, dy);
    if (!dist) continue;
    const ux = dx / dist, uy = dy / dist, ring = dist > 1.5 * d ? 2 : 1;
    const out = rand() * J * ring, side = (rand() - 0.5) * J;
    p.x += ux * out - uy * side;
    p.y += uy * out + ux * side;
  }
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < pieces.length; i++) for (let k = i + 1; k < pieces.length; k++) {
      const a = pieces[i], b = pieces[k];
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1, over = 2 * R + 0.1 - dist;
      if (over > 0) { a.x -= (dx / dist) * over / 2; a.y -= (dy / dist) * over / 2; b.x += (dx / dist) * over / 2; b.y += (dy / dist) * over / 2; moved = true; }
    }
    if (!moved) break;
  }
  for (const p of pieces) Object.assign(p, { vx: 0, vy: 0, r: R, m: MASS[p.kind], inPlay: true });
  return pieces;
}

export const coinsOf = (state) => (state.easy ? 3 : 9);

export function newGame({ mode = 'computer', first = 'white', easy = false, score = { white: 0, black: 0 } } = {}) {
  return {
    mode,                          // 'computer' (you are white at the bottom) | 'two' (hot seat)
    easy,                          // easy game: 7 pieces, no dues, queen counts at once
    pieces: rack({ easy }),
    striker: null,                 // set while a shot is running
    turn: first,                   // colour on turn; white shoots from the bottom, black from the top
    pocketed: { white: 0, black: 0 },
    queen: { state: 'board', by: null }, // board | pending (must be covered next) | covered
    winner: null,
    points: 0,
    score: { ...score },           // match score before this board, by colour (for laws 33, 37, 93–101)
    reason: null,                  // why a board ended early (ECC laws 93–101), for the UI
    dues: { white: 0, black: 0 },  // coins owed for a pocketed striker, paid when available (L57)
    broken: easy,                  // the break is done once the striker touched a coin (L23)
    breakTries: 0,
    log: [],                       // short messages for the status line, newest last
    shots: 0,
  };
}

export const side = (color) => (color === 'white' ? 'bottom' : 'top');

export function clampStrikerX(x) {
  return Math.min(BASE_X[1], Math.max(BASE_X[0], x));
}

// Base lines: two lines 31.8 mm apart, the outer one 102 mm from the edge, red base circles
// (Ø 31.8 mm) at both ends, centred 150.9 mm from the side edges.
const LINES = { bottom: [BOARD - 102, BOARD - 102 - 31.8], top: [102, 102 + 31.8] };
const RING_R = 15.9;
const RING_X = [135 + RING_R, BOARD - 135 - RING_R];

/** Striker centre heights that still touch both base lines (law 117): the striker may sit a little
 * forward or back, e.g. to fit next to a coin lying on the line. */
export function strikerYRange(state, color = state.turn) {
  const r = geom(state).striker, [a, b] = LINES[side(color)];
  return [Math.max(a, b) - r, Math.min(a, b) + r];
}

/** Law 118 (not on Easy): over a red base circle the striker must cover it entirely, or not touch it. */
function circlesOk(state, x, y, color) {
  if (state.easy) return true;
  const r = geom(state).striker, [a, b] = LINES[side(color)], cy = (a + b) / 2;
  return RING_X.every((cx) => { const d = Math.hypot(x - cx, y - cy); return d + RING_R <= r + 0.01 || d >= r + RING_R; });
}

const coinsClear = (state, x, y) => state.pieces.every((p) => !p.inPlay || Math.hypot(p.x - x, p.y - y) >= p.r + geom(state).striker);

/** Where the striker sits at x: the base-line height nearest the middle that is free of coins and
 * obeys the circle rule, or null when there is none. */
export function strikerSpot(state, x, color = state.turn) {
  const base = BASE_Y[side(color)], [lo, hi] = strikerYRange(state, color);
  for (let d = 0; d <= hi - lo; d += 0.25) {
    for (const y of d ? [base - d, base + d] : [base]) {
      if (y < lo - 1e-9 || y > hi + 1e-9) continue;
      if (circlesOk(state, x, y, color) && coinsClear(state, x, y)) return y;
    }
  }
  return null;
}

/** Can the striker be placed at x on the colour's base line? */
export function strikerFree(state, x, color = state.turn) {
  return strikerSpot(state, x, color) !== null;
}

/** Nearest x that obeys the circle rule, searching in the direction of movement first (dir ±1). */
export function snapStrikerX(state, x, dir = 0, color = state.turn) {
  x = clampStrikerX(x);
  const y = BASE_Y[side(color)];
  if (circlesOk(state, x, y, color)) return x;
  const order = dir > 0 ? [1, -1] : dir < 0 ? [-1, 1] : [1, -1];
  let best = null;
  for (const sgn of order) {
    for (let d = 0.25; d < 80; d += 0.25) {
      const t = x + sgn * d;
      if (t < BASE_X[0] || t > BASE_X[1]) break;
      if (circlesOk(state, t, y, color)) { if (dir || !best || d < Math.abs(best - x)) best = t; break; }
    }
    if (dir && best !== null) return best;
  }
  return best ?? x;
}

/** Is a shot direction allowed? ICF rules allow any direction, back shots included. */
export function forward(color, vy) {
  return Number.isFinite(vy);
}

// ---------------------------------------------------------------- physics

// Pieces closer than this count as touching, so a push travels through a packed rack at once.
const CONTACT = 0.6;

/** Separate an overlapping pair and return its impulse [a, b, jx, jy] when they approach, else null. */
function contact(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy), min = a.r + b.r;
  if (dist >= min + CONTACT || dist === 0) return null;
  const nx = dx / dist, ny = dy / dist;
  if (dist < min) {
    const overlap = min - dist, tot = a.m + b.m;
    a.x -= nx * overlap * (b.m / tot); a.y -= ny * overlap * (b.m / tot);
    b.x += nx * overlap * (a.m / tot); b.y += ny * overlap * (a.m / tot);
  }
  if (a.kind === 'striker') a.touched = true;
  if (b.kind === 'striker') b.touched = true;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= -1e-3) return null;
  const j = (-(1 + E_BALL) * rel) / (1 / a.m + 1 / b.m);
  return [a, b, j * nx, j * ny];
}

/**
 * Advance the bodies by one frame step. Fast shots are split into sub-steps of at most ~1.5 mm of
 * travel, so the striker never skips into the pack, and contacts are resolved repeatedly within a
 * sub-step: hitting the front of a touching row sends the coin at the far end off along that row
 * (as in a real break), instead of the force scattering. Returns pieces that fell into a pocket.
 */
export function step(bodies, dt = DT, g = FULL_GEOM) {
  let vmax = 0;
  for (const p of bodies) if (p.inPlay) vmax = Math.max(vmax, Math.abs(p.vx) + Math.abs(p.vy));
  const n = Math.min(40, Math.max(1, Math.ceil((vmax * dt) / 1.5)));
  const fell = [];
  for (let i = 0; i < n; i++) fell.push(...subStep(bodies, dt / n, g));
  return fell;
}

function subStep(bodies, dt, g) {
  const fell = [];
  for (const p of bodies) {
    if (!p.inPlay) continue;
    const v = Math.hypot(p.vx, p.vy);
    if (v < STOP) { p.vx = p.vy = 0; continue; }
    const nv = Math.max(0, v - FRICTION * dt);
    p.vx *= nv / v; p.vy *= nv / v;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  // Contacts are solved together (all impulses from the same velocities, then applied), repeated
  // until nothing approaches. Solving pairs one by one would bias the push towards list order.
  for (let pass = 0; pass < 40; pass++) {
    const imp = [];
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.inPlay) continue;
      for (let k = i + 1; k < bodies.length; k++) {
        const b = bodies[k];
        if (b.inPlay) { const j = contact(a, b); if (j) imp.push(j); }
      }
    }
    if (!imp.length) break;
    // A piece pressed from several sides shares its push between them (keeps energy in check).
    const cnt = new Map();
    for (const [a, b] of imp) { cnt.set(a, (cnt.get(a) ?? 0) + 1); cnt.set(b, (cnt.get(b) ?? 0) + 1); }
    for (const [a, b, jx, jy] of imp) {
      const k = 1 / Math.sqrt(Math.max(cnt.get(a), cnt.get(b)));
      a.vx -= (k * jx) / a.m; a.vy -= (k * jy) / a.m;
      b.vx += (k * jx) / b.m; b.vy += (k * jy) / b.m;
    }
  }
  for (const p of bodies) {
    if (!p.inPlay) continue;
    for (const [px, py] of g.pockets) {
      if (Math.hypot(p.x - px, p.y - py) < g.pocket) {
        p.inPlay = false; p.vx = p.vy = 0; p.x = px; p.y = py;
        fell.push(p);
        break;
      }
    }
    if (!p.inPlay) continue;
    if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * E_WALL; }
    if (p.x > BOARD - p.r) { p.x = BOARD - p.r; p.vx = -Math.abs(p.vx) * E_WALL; }
    if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * E_WALL; }
    if (p.y > BOARD - p.r) { p.y = BOARD - p.r; p.vy = -Math.abs(p.vy) * E_WALL; }
  }
  return fell;
}

export const moving = (bodies) => bodies.some((p) => p.inPlay && (p.vx || p.vy));

/** Put the striker on the base line and give it a velocity. angle in radians, power 0–1. */
export function startShot(state, x, angle, power) {
  const color = state.turn;
  const v = Math.max(0.015, Math.min(1, power)) * MAX_SPEED;
  state.striker = { id: 'striker', kind: 'striker', color: 'striker', by: color, x: clampStrikerX(x), y: strikerSpot(state, clampStrikerX(x), color) ?? BASE_Y[side(color)], r: geom(state).striker, m: MASS.striker, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, inPlay: true };
  state.fell = [];
  state.shots++;
}

export const bodiesOf = (state) => (state.striker ? [...state.pieces, state.striker] : state.pieces);

/** One fixed step of a running shot. Returns true while something still moves. */
export function tick(state) {
  const fell = step(bodiesOf(state), DT, geom(state));
  if (fell.length) state.fell.push(...fell);
  return moving(bodiesOf(state));
}

// ---------------------------------------------------------------- rules

// Placing a piece back (laws 70, 76, 80, 81): the queen goes on the centre spot, or as near as it
// fits. A returned coin goes inside the outer circle (Ø 170 mm) but must not cover the small centre
// circle; the spot nearest the centre that is free is used. Only when the circle is full does it go
// just outside, as near the centre as possible.
const OUTER_R = 85, CENTRE_R = 15.9;
function freeSpot(state, kind = 'coin') {
  const R = geom(state).coin;
  const free = (x, y) => state.pieces.every((p) => !p.inPlay || Math.hypot(p.x - x, p.y - y) >= p.r + R + 0.5);
  const minD = kind === 'queen' ? 0 : CENTRE_R + R + 0.5;
  const search = (maxD, stepMm) => {
    let best = null, bestD = Infinity;
    for (let dy = -maxD; dy <= maxD; dy += stepMm) {
      for (let dx = -maxD; dx <= maxD; dx += stepMm) {
        const d = Math.hypot(dx, dy);
        if (d < minD || d > maxD || d >= bestD) continue;
        if (free(CENTER + dx, CENTER + dy)) { best = [CENTER + dx, CENTER + dy]; bestD = d; }
      }
    }
    return best;
  };
  if (kind === 'queen' && free(CENTER, CENTER)) return [CENTER, CENTER];
  return search(OUTER_R - R, 1.5) ?? search(CENTER - R - 40, 3) ?? [CENTER, CENTER];
}

function returnPiece(state, piece) {
  const [x, y] = freeSpot(state, piece.kind);
  Object.assign(piece, { x, y, vx: 0, vy: 0, inPlay: true });
  if (piece.kind === 'coin') state.pocketed[piece.color]--;
}

function returnOne(state, color) {
  const p = state.pieces.find((q) => !q.inPlay && q.color === color);
  if (p) { returnPiece(state, p); return true; }
  return false;
}

/**
 * Apply the rules once everything has stopped. Mutates state; returns a summary for the UI.
 * Medium and Hard follow the Laws of Carrom as adopted by the ECC (singles, one board); law numbers
 * in the comments. Easy uses its own short rules (endShotEasy).
 */
export function endShot(state) {
  if (state.easy) return endShotEasy(state);
  const me = state.turn, opp = other(me);
  const fell = state.fell ?? [];
  const touched = !!state.striker?.touched;
  const foul = fell.some((p) => p.kind === 'striker');
  const mine = fell.filter((p) => p.color === me);
  const theirs = fell.filter((p) => p.color === opp);
  const queenIn = fell.some((p) => p.kind === 'queen');
  const queen = state.pieces[0];
  state.striker = null;
  state.fell = [];
  const msg = [];
  const done = (again) => {
    if (!state.winner && !again) state.turn = opp;
    const summary = { by: me, foul, mine: mine.length, theirs: theirs.length, queenIn, again, msg, winner: state.winner, reason: state.reason };
    state.log.push(summary);
    return summary;
  };

  // The break (L23–L26): the striker must touch a coin; three attempts, then the break passes.
  // A pocketed striker on a missed attempt costs only the turn, no due.
  if (!state.broken) {
    if (!touched) {
      state.breakTries = (state.breakTries ?? 0) + 1;
      if (state.breakTries >= 3) { state.breakTries = 0; msg.push('break-lost'); return done(false); }
      msg.push(foul ? 'break-lost' : 'break-retry');
      if (foul) state.breakTries = 0;
      return done(!foul);
    }
    state.broken = true;
  }

  const hadOwn = state.pocketed[me] > 0;
  const owed = state.dues[me] > 0;
  const before = state.pocketed[me];
  state.pocketed[me] += mine.length;
  state.pocketed[opp] += theirs.length;
  const pending = state.queen.state === 'pending' && state.queen.by === me;
  const queenBack = (key) => { if (!queen.inPlay) returnPiece(state, queen); state.queen = { state: 'board', by: null }; if (key) msg.push(key); };
  let again = false;

  if (foul) {
    // Striker pocketed = due (L56–L60): your coins of this stroke go back plus one more.
    // With your own coin (or the queen) in the same stroke you play on, otherwise the turn ends.
    // The queen goes back first so it gets the centre spot (L80).
    if (queenIn) queenBack();                       // L89, L90
    else if (pending && !mine.length) queenBack();  // L91; with an own coin it stays to be covered (L92)
    for (const p of mine) returnPiece(state, p);
    state.dues[me]++;
    again = mine.length > 0 || queenIn;
    msg.push(again ? 'foul-on' : 'foul');
  } else {
    if (pending) {
      if (mine.length) { state.queen = { state: 'covered', by: me }; msg.push('covered'); }
      else queenBack('queen-back');                 // L86
    }
    if (queenIn) {
      if (owed) queenBack('queen-due');             // L83
      else if (mine.length) { state.queen = { state: 'covered', by: me }; msg.push('covered'); } // L87
      else if (hadOwn) { state.queen = { state: 'pending', by: me }; msg.push('pending'); again = true; }
      else queenBack('queen-early');                // L79, L82
    }
    if (mine.length) { again = !(queenIn && owed); msg.push('own'); }
    if (theirs.length) msg.push('theirs');
    if (!fell.length) msg.push('miss');
  }

  // Pay dues as soon as you have a pocketed coin (L57).
  while (state.dues[me] > 0 && returnOne(state, me)) { state.dues[me]--; if (!msg.includes('due-paid')) msg.push('due-paid'); }

  // End of the board (L32, L34–L38, L93–L101). Points = opponent's coins left + 3 for your queen.
  const covered = state.queen.state === 'covered';
  const left = (c) => 9 - state.pocketed[c];
  const win = (c, points, reason = null) => { state.winner = c; state.points = Math.min(12, points); state.reason = reason; };
  // From 22 match points on, the queen no longer adds 3 (L33, L37) and the 3-point penalties become 1.
  const late = (c) => (state.score?.[c] ?? 0) >= 22;
  const qp = (c) => (late(c) ? 0 : 3), pen = (c) => (late(c) ? 1 : 3);
  const queenFor = (c) => (state.queen.by === c ? qp(c) : 0);
  const myAll = state.pocketed[me] === 9, oppAll = state.pocketed[opp] === 9;
  if (foul) {
    // L98 only when the queen is still on the board; with the queen in the same stroke L89 applies:
    // queen, coin and a due go back and you play on.
    if (!covered && !queenIn && before + mine.length === 9) win(opp, pen(opp) + 1, 'last-own-striker'); // L98
    else if (oppAll && !covered) win(opp, left(me) + qp(opp) + 1, 'last-their-striker');          // L101
    else if (oppAll) win(opp, left(me) + queenFor(opp));
  } else if (myAll && oppAll) {
    if (!covered) win(opp, pen(opp), 'both-last');                                                  // L95
    else win(me, state.queen.by === me ? pen(me) : 1, 'both-last-covered');                        // L93, L94
  } else if (myAll) {
    if (covered) win(me, left(opp) + queenFor(me));                       // L32
    else win(opp, pen(opp), 'last-own');                                                            // L97
  } else if (oppAll) {
    if (covered) win(opp, left(me) + queenFor(opp));
    else win(opp, left(me) + qp(opp), 'last-their');                                               // L96
  }
  return done(again);
}

/**
 * Easy rules: every pocketed coin counts for its colour (no dues). Your own coin or the queen lets
 * you shoot again, even if the striker went in too; a pocketed striker on its own just ends the turn.
 * The queen must be covered by your own coin in the same or the next stroke (else it goes back to the
 * centre) and is worth +3 to whoever covers it. It must be covered before a colour's last coin: a
 * last coin pocketed earlier goes back to the centre and the turn ends. The first colour with all
 * its coins in wins.
 */
function endShotEasy(state) {
  const me = state.turn, opp = other(me);
  const fell = state.fell ?? [];
  const foul = fell.some((p) => p.kind === 'striker');
  const mine = fell.filter((p) => p.color === me);
  const theirs = fell.filter((p) => p.color === opp);
  const queenIn = fell.some((p) => p.kind === 'queen');
  state.pocketed[me] += mine.length;
  state.pocketed[opp] += theirs.length;
  state.striker = null;
  state.fell = [];
  const msg = [];
  let again = mine.length > 0 || queenIn;
  const queen = state.pieces[0];
  if (state.queen.state === 'pending' && state.queen.by === me) {
    if (mine.length) { state.queen = { state: 'covered', by: me }; msg.push('covered'); }
    else { returnPiece(state, queen); state.queen = { state: 'board', by: null }; msg.push('queen-back'); }
  }
  if (queenIn) {
    if (mine.length) { state.queen = { state: 'covered', by: me }; msg.push('covered'); }
    else { state.queen = { state: 'pending', by: me }; msg.push('pending'); }
  }
  if (foul) msg.push(again ? 'foul-easy-on' : 'foul-easy');
  if (mine.length) msg.push('own');
  if (theirs.length) msg.push('theirs');
  if (!fell.length) msg.push('miss');
  const n = coinsOf(state);
  if (state.queen.state !== 'covered') {
    for (const c of [me, opp]) {
      if (state.pocketed[c] >= n) { returnOne(state, c); msg.unshift('queen-first'); again = false; }
    }
  }
  const done = [me, opp].filter((c) => state.pocketed[c] >= n);
  if (done.length) {
    const c = done.length === 2 ? me : done[0];
    state.winner = c;
    state.points = n - state.pocketed[other(c)] + (state.queen.by === c ? 3 : 0);
  }
  if (!state.winner && !again) state.turn = opp;
  const summary = { by: me, foul, mine: mine.length, theirs: theirs.length, queenIn, again, msg, winner: state.winner };
  state.log.push(summary);
  return summary;
}

// ---------------------------------------------------------------- match

/** A game is played to 25 points or at most 8 boards; after the 8th board the leader wins, level
 * scores are a draw (law 39). Easy plays to 10, also at most 8 boards. Returns the winning key of
 * totals, 'draw', or null while the game goes on. */
export const MATCH = { full: { target: 25, boards: 8 }, easy: { target: 10, boards: 8 } };
export function matchWinner(totals, boards, easy = false) {
  const { target, boards: max } = easy ? MATCH.easy : MATCH.full;
  const [[a, pa], [b, pb]] = Object.entries(totals);
  if (pa >= target || pb >= target) return pa >= pb ? a : b;
  if (boards >= max) return pa === pb ? 'draw' : pa > pb ? a : b;
  return null;
}

// ---------------------------------------------------------------- aiming guide

/** First piece a circle of radius r moving from (ax, ay) along unit (dx, dy) touches, within max mm. */
function cast(state, ax, ay, dx, dy, r, ignore, max) {
  let best = null;
  for (const p of state.pieces) {
    if (!p.inPlay || p === ignore) continue;
    const fx = p.x - ax, fy = p.y - ay, R = r + p.r;
    const along = fx * dx + fy * dy;
    if (along <= 0) continue;
    const off2 = fx * fx + fy * fy - along * along;
    if (off2 >= R * R) continue;
    const t = along - Math.sqrt(R * R - off2);
    if (t < max && (!best || t < best.t)) best = { t, piece: p };
  }
  return best;
}

/** Distance from (x, y) along (dx, dy) to the cushion for a piece of radius r. */
function toWall(x, y, dx, dy, r) {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (BOARD - r - x) / dx); else if (dx < 0) t = Math.min(t, (r - x) / dx);
  if (dy > 0) t = Math.min(t, (BOARD - r - y) / dy); else if (dy < 0) t = Math.min(t, (r - y) / dy);
  return t;
}

/**
 * Where a shot from x at angle goes: the striker's straight path up to the first coin it touches,
 * that coin's direction (along the line of centres) and, if it runs into another coin, that one too.
 * Each line is { from: [x, y], to: [x, y], piece? }. Speed and friction are ignored.
 */
export function predictShot(state, x, angle) {
  const g = geom(state);
  const y = strikerSpot(state, x) ?? BASE_Y[side(state.turn)];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const wall = toWall(x, y, dx, dy, g.striker);
  const hit = cast(state, x, y, dx, dy, g.striker, null, wall);
  const t = hit ? hit.t : wall;
  const striker = { from: [x, y], to: [x + dx * t, y + dy * t] };
  const out = { striker, coins: [] };
  let cur = hit?.piece, from = striker.to;
  for (let k = 0; k < 2 && cur; k++) {
    const ux = cur.x - from[0], uy = cur.y - from[1], ul = Math.hypot(ux, uy) || 1;
    const cx = ux / ul, cy = uy / ul;
    const w = toWall(cur.x, cur.y, cx, cy, cur.r);
    const next = cast(state, cur.x, cur.y, cx, cy, cur.r, cur, w);
    const len = next ? next.t : w;
    const to = [cur.x + cx * len, cur.y + cy * len];
    out.coins.push({ from: [cur.x, cur.y], to, piece: cur });
    from = to; cur = next?.piece;
  }
  return out;
}

// ---------------------------------------------------------------- computer opponent

function clone(state) {
  return { ...state, pieces: state.pieces.map((p) => ({ ...p })), pocketed: { ...state.pocketed }, queen: { ...state.queen }, log: [], striker: null };
}

/** Run a whole shot on a copy of the state and score the outcome for the shooter. */
export function simulate(state, shot, maxSteps = 2400) {
  const s = clone(state);
  startShot(s, shot.x, shot.angle, shot.power);
  for (let i = 0; i < maxSteps && tick(s); i++);
  const me = state.turn;
  const fell = s.fell;
  const foul = fell.some((p) => p.kind === 'striker');
  const mine = fell.filter((p) => p.color === me).length;
  const theirs = fell.filter((p) => p.color === other(me)).length;
  const queen = fell.some((p) => p.kind === 'queen');
  let score = mine * 10 - theirs * 6 + (queen && (state.easy || state.pocketed[me] > 0 || mine) ? 8 : 0);
  if (state.queen.state === 'pending' && state.queen.by === me) score += mine ? 12 : -10;
  if (foul) score -= state.easy ? 8 : 18 + mine * 10;
  if (state.easy && state.queen.state !== 'covered' && !queen) {
    // Easy: a last coin before the queen just comes back, a wasted shot.
    if (state.pocketed[me] + mine >= coinsOf(state)) score -= 12;
    if (state.pocketed[other(me)] + theirs >= coinsOf(state)) score -= 12;
  }
  if (!state.easy && state.queen.state !== 'covered' && !(queen && mine)) {
    // Clearing a colour while the queen is still in play loses the board (ECC laws 96, 97).
    if (state.pocketed[me] + mine >= 9) score -= 60;
    if (state.pocketed[other(me)] + theirs >= 9) score -= 60;
  }
  // Leave the opponent little: own coins near pockets are good, theirs are bad.
  for (const p of s.pieces) {
    if (!p.inPlay || p.kind !== 'coin') continue;
    const d = Math.min(...geom(state).pockets.map(([x, y]) => Math.hypot(p.x - x, p.y - y)));
    if (d < 140) score += (p.color === me ? 0.6 : -0.8) * (1 - d / 140);
  }
  return { score, mine, theirs, foul, queen };
}

/**
 * Just enough power: the coin should reach the pocket still rolling at about 25 cm/s.
 * sl = striker travel to the coin, ul = coin travel to the pocket, cut = cos of the cut angle.
 */
const HIT = ((1 + E_BALL) * MASS.striker) / (MASS.striker + MASS.coin); // coin speed per striker speed, head-on
export function shotPower(sl, ul, cut) {
  const coin = Math.sqrt(2 * FRICTION * Math.max(0, ul) + 250 ** 2);
  const atHit = coin / (HIT * Math.max(0.35, cut));
  const start = Math.sqrt(atHit ** 2 + 2 * FRICTION * sl);
  return Math.min(1, start / MAX_SPEED);
}

function pathClear(state, ax, ay, bx, by, r, ignore) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  for (const p of state.pieces) {
    if (!p.inPlay || p === ignore) continue;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (len * len)));
    if (Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y) < r + p.r - 1) return false;
  }
  return true;
}

/**
 * Choose a shot for the colour on turn. Candidate shots aim the striker so that it sends a coin
 * (own coins, the queen when allowed) straight at a pocket; the best few are simulated in full.
 * skill 0–1 adds aiming noise for a beatable opponent. simple: a casual opponent that does not
 * search, it takes one of the more obvious straight shots at random and aims it loosely.
 */
export function chooseShot(state, { skill = 0.75, rand = Math.random, budget = 90, simple = false } = {}) {
  const me = state.turn;
  const y = BASE_Y[side(me)];
  const { striker: SR, pockets } = geom(state);
  const targets = state.pieces.filter((p) => p.inPlay && (p.color === me || (p.kind === 'queen' && (state.easy || (state.pocketed[me] > 0 && !state.dues?.[me])))));
  const cands = [];
  for (let xi = 0; xi <= 16; xi++) {
    const x = BASE_X[0] + ((BASE_X[1] - BASE_X[0]) * xi) / 16;
    const y = strikerSpot(state, x, me);
    if (y === null) continue;
    for (const t of targets) {
      for (const [px, py] of pockets) {
        const ux = px - t.x, uy = py - t.y, ul = Math.hypot(ux, uy);
        const cx = t.x - (ux / ul) * (t.r + SR), cy = t.y - (uy / ul) * (t.r + SR);
        const sx = cx - x, sy = cy - y, sl = Math.hypot(sx, sy);
        const cut = (sx * ux + sy * uy) / (sl * ul); // cos of the cut angle
        if (cut < 0.3) continue;
        if (!pathClear(state, t.x, t.y, px, py, t.r, t)) continue;
        if (!pathClear(state, x, y, cx, cy, SR, t)) continue;
        const dist = sl + ul;
        const power = shotPower(sl, ul - geom(state).pocket * 0.5, cut);
        cands.push({ x, angle: Math.atan2(sy, sx), power, h: cut * 3 - dist / 400 + (t.kind === 'queen' ? 1 : 0) });
      }
    }
  }
  // Fallback: a firm break, or a medium shot at the middle to open things up.
  const opening = state.pieces.every((p) => p.inPlay && Math.hypot(p.x - CENTER, p.y - CENTER) < 120);
  if (opening && !simple) {
    // Break along the rack's diagonal: hit the nearest coin on it so that the push runs through the
    // pack and drives the coin at the far end into the far pocket.
    const near = state.pieces.reduce((a, p) => ((me === 'white' ? p.x + p.y > a.x + a.y : p.x + p.y < a.x + a.y) ? p : a));
    const k = (me === 'white' ? 1 : -1) * Math.SQRT1_2 * (near.r + SR);
    cands.length = 0;
    for (const x of [BASE_X[1] - 10, BASE_X[1] - 60, BASE_X[0] + 10, BASE_X[0] + 60]) {
      if (!strikerFree(state, x, me)) continue;
      cands.push({ x, angle: Math.atan2(near.y + k - y, near.x + k - x), power: 0.8, h: 5 });
    }
  }
  if (!cands.length) {
    for (let xi = 0; xi <= 8; xi++) {
      const x = BASE_X[0] + ((BASE_X[1] - BASE_X[0]) * xi) / 8;
      if (!strikerFree(state, x, me)) continue;
      cands.push({ x, angle: Math.atan2(CENTER - y, CENTER - x), power: opening ? 0.7 : 0.4, h: 0 });
    }
  }
  if (!cands.length) cands.push({ x: CENTER, angle: me === 'white' ? -Math.PI / 2 : Math.PI / 2, power: 0.8, h: 0 });
  cands.sort((a, b) => b.h - a.h);
  if (simple) {
    const c = cands[Math.floor(rand() * Math.min(cands.length, 6))];
    const noise = 0.12;
    return { x: c.x, angle: c.angle + (rand() - 0.5) * 2 * noise, power: Math.min(1, c.power * (0.95 + rand() * 0.35)) };
  }
  let best = null;
  const pool = cands.slice(0, budget);
  for (const c of pool) {
    for (const dp of [1, 1.15, 1.35]) {
      const shot = { x: c.x, angle: c.angle, power: Math.min(1, c.power * dp) };
      const r = simulate(state, shot);
      r.score -= shot.power * 3; // prefer the gentlest shot that does the job
      if (!best || r.score > best.score) best = { ...shot, score: r.score };
    }
  }
  const noise = (1 - skill) * 0.06;
  return { x: best.x, angle: best.angle + (rand() - 0.5) * 2 * noise, power: Math.min(1, best.power * (1 + (rand() - 0.5) * noise * 2)) };
}
