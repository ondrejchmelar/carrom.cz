// Carrom game engine: board geometry, physics, simplified ICF rules and a computer opponent.
// Pure JS without DOM, so the browser game and node tests share it. Units: millimetres, seconds.

export const BOARD = 740;               // playing surface 74 × 74 cm
export const POCKET_R = 22.25;          // pocket Ø 44.5 mm
export const COIN_R = 15.9;             // coin Ø 31.8 mm
export const STRIKER_R = 20.6;          // striker Ø 41.3 mm
export const CENTER = BOARD / 2;
export const BASE_Y = { bottom: BOARD - 118, top: 118 }; // striker centre on the base line
export const BASE_X = [151, BOARD - 151];                 // allowed striker centre range
export const MAX_SPEED = 5200;          // mm/s for a full-power shot
const FRICTION = 820;                   // mm/s² sliding deceleration on a powdered board
const DAMP = 0.35;                      // extra speed-proportional damping (1/s)
const E_BALL = 0.9, E_WALL = 0.72;      // restitution
const MASS = { coin: 5.5, queen: 5.5, striker: 15 };
const STOP = 6;                         // mm/s below which a piece is at rest
const DT = 1 / 240;

export const POCKETS = [
  [POCKET_R, POCKET_R], [BOARD - POCKET_R, POCKET_R],
  [POCKET_R, BOARD - POCKET_R], [BOARD - POCKET_R, BOARD - POCKET_R],
];

const other = (c) => (c === 'white' ? 'black' : 'white');

/** Starting position: queen in the centre, 6 coins around it, 12 in the outer ring (hexagonal packing). */
export function rack() {
  const pieces = [{ id: 0, kind: 'queen', color: 'queen', x: CENTER, y: CENTER }];
  const d = COIN_R * 2 + 0.2;
  const inner = [], outer = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    inner.push([Math.cos(a) * d, Math.sin(a) * d]);
    outer.push([Math.cos(a) * 2 * d, Math.sin(a) * 2 * d]);
    const b = a + Math.PI / 6;
    outer.push([Math.cos(b) * Math.sqrt(3) * d, Math.sin(b) * Math.sqrt(3) * d]);
  }
  // White forms a "Y" through the inner ring, as on a real board.
  const innerColors = ['white', 'black', 'white', 'black', 'white', 'black'];
  const outerColors = ['black', 'white', 'white', 'black', 'black', 'white', 'white', 'black', 'black', 'white', 'white', 'black'];
  let id = 1;
  inner.forEach(([dx, dy], i) => pieces.push({ id: id++, kind: 'coin', color: innerColors[i], x: CENTER + dx, y: CENTER + dy }));
  outer.forEach(([dx, dy], i) => pieces.push({ id: id++, kind: 'coin', color: outerColors[i], x: CENTER + dx, y: CENTER + dy }));
  for (const p of pieces) Object.assign(p, { vx: 0, vy: 0, r: COIN_R, m: MASS[p.kind], inPlay: true });
  return pieces;
}

export function newGame({ mode = 'computer', first = 'white' } = {}) {
  return {
    mode,                          // 'computer' (you are white at the bottom) | 'two' (hot seat)
    pieces: rack(),
    striker: null,                 // set while a shot is running
    turn: first,                   // colour on turn; white shoots from the bottom, black from the top
    pocketed: { white: 0, black: 0 },
    queen: { state: 'board', by: null }, // board | pending (must be covered next) | covered
    winner: null,
    points: 0,
    log: [],                       // short messages for the status line, newest last
    shots: 0,
  };
}

export const side = (color) => (color === 'white' ? 'bottom' : 'top');

export function clampStrikerX(x) {
  return Math.min(BASE_X[1], Math.max(BASE_X[0], x));
}

/** Can the striker sit at x on the colour's base line without lying on a coin? */
export function strikerFree(state, x, color = state.turn) {
  const y = BASE_Y[side(color)];
  return state.pieces.every((p) => !p.inPlay || Math.hypot(p.x - x, p.y - y) >= p.r + STRIKER_R);
}

/** Is a shot direction allowed? ICF rules allow any direction, back shots included. */
export function forward(color, vy) {
  return Number.isFinite(vy);
}

// ---------------------------------------------------------------- physics

function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy), min = a.r + b.r;
  if (dist >= min || dist === 0) return false;
  const nx = dx / dist, ny = dy / dist;
  // separate
  const overlap = min - dist, tot = a.m + b.m;
  a.x -= nx * overlap * (b.m / tot); a.y -= ny * overlap * (b.m / tot);
  b.x += nx * overlap * (a.m / tot); b.y += ny * overlap * (a.m / tot);
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel > 0) return true;
  const j = (-(1 + E_BALL) * rel) / (1 / a.m + 1 / b.m);
  a.vx -= (j / a.m) * nx; a.vy -= (j / a.m) * ny;
  b.vx += (j / b.m) * nx; b.vy += (j / b.m) * ny;
  return true;
}

/** Advance the bodies by one fixed step. Returns pieces that fell into a pocket during it. */
export function step(bodies, dt = DT) {
  const fell = [];
  for (const p of bodies) {
    if (!p.inPlay) continue;
    const v = Math.hypot(p.vx, p.vy);
    if (v < STOP) { p.vx = p.vy = 0; continue; }
    const nv = Math.max(0, v - (FRICTION + DAMP * v) * dt);
    p.vx *= nv / v; p.vy *= nv / v;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.inPlay) continue;
    for (let k = i + 1; k < bodies.length; k++) {
      const b = bodies[k];
      if (b.inPlay) collide(a, b);
    }
  }
  for (const p of bodies) {
    if (!p.inPlay) continue;
    for (const [px, py] of POCKETS) {
      if (Math.hypot(p.x - px, p.y - py) < POCKET_R) {
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
  const v = Math.max(0.04, Math.min(1, power)) * MAX_SPEED;
  state.striker = { id: 'striker', kind: 'striker', color, x: clampStrikerX(x), y: BASE_Y[side(color)], r: STRIKER_R, m: MASS.striker, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, inPlay: true };
  state.fell = [];
  state.shots++;
}

export const bodiesOf = (state) => (state.striker ? [...state.pieces, state.striker] : state.pieces);

/** One fixed step of a running shot. Returns true while something still moves. */
export function tick(state) {
  const fell = step(bodiesOf(state));
  if (fell.length) state.fell.push(...fell);
  return moving(bodiesOf(state));
}

// ---------------------------------------------------------------- rules (simplified ICF)

function freeSpot(state) {
  for (let ring = 0; ring < 12; ring++) {
    const steps = ring === 0 ? 1 : ring * 8;
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const x = CENTER + Math.cos(a) * ring * COIN_R * 1.2, y = CENTER + Math.sin(a) * ring * COIN_R * 1.2;
      if (state.pieces.every((p) => !p.inPlay || Math.hypot(p.x - x, p.y - y) >= p.r + COIN_R + 0.5)) return [x, y];
    }
  }
  return [CENTER, CENTER];
}

function returnPiece(state, piece) {
  const [x, y] = freeSpot(state);
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
 * Simplified ICF: pocket your own coin to shoot again; the queen counts only when covered by your
 * next coin; pocketing the striker is a foul (your pocketed coins of that shot and one more go back).
 */
export function endShot(state) {
  const me = state.turn, opp = other(me);
  const fell = state.fell ?? [];
  const foul = fell.some((p) => p.kind === 'striker');
  const mine = fell.filter((p) => p.color === me);
  const theirs = fell.filter((p) => p.color === opp);
  const queenIn = fell.some((p) => p.kind === 'queen');
  const queen = state.pieces[0];
  const hadOwn = state.pocketed[me] > 0;
  state.pocketed[me] += mine.length;
  state.pocketed[opp] += theirs.length;
  state.striker = null;
  state.fell = [];
  const msg = [];
  let again = false;

  if (foul) {
    for (const p of mine) returnPiece(state, p);
    const penalty = returnOne(state, me);
    if (queenIn || (state.queen.state === 'pending' && state.queen.by === me)) {
      if (!queen.inPlay) returnPiece(state, queen);
      state.queen = { state: 'board', by: null };
    }
    msg.push(penalty || mine.length ? 'foul' : 'foul-free');
  } else {
    if (state.queen.state === 'pending' && state.queen.by === me) {
      if (mine.length) { state.queen = { state: 'covered', by: me }; msg.push('covered'); }
      else { returnPiece(state, queen); state.queen = { state: 'board', by: null }; msg.push('queen-back'); }
    }
    if (queenIn) {
      if (mine.length) { state.queen = { state: 'covered', by: me }; msg.push('covered'); }
      else if (hadOwn) { state.queen = { state: 'pending', by: me }; msg.push('pending'); again = true; }
      else { returnPiece(state, queen); state.queen = { state: 'board', by: null }; msg.push('queen-early'); }
    }
    if (mine.length) { again = true; msg.push('own'); }
    if (theirs.length) msg.push('theirs');
    if (!fell.length) msg.push('miss');
  }

  // You may not clear your coins while the queen is still in play: the last coin goes back.
  for (const c of [me, opp]) {
    if (state.pocketed[c] === 9 && state.queen.state !== 'covered') {
      returnOne(state, c);
      if (c === me) { again = false; msg.push('last-coin'); }
    }
  }

  for (const c of [me, opp]) {
    if (state.pocketed[c] === 9 && state.queen.state === 'covered') {
      state.winner = c;
      state.points = 9 - state.pocketed[other(c)] + (state.queen.by === c ? 3 : 0);
    }
  }
  if (!state.winner && !again) state.turn = opp;
  const summary = { by: me, foul, mine: mine.length, theirs: theirs.length, queenIn, again, msg, winner: state.winner };
  state.log.push(summary);
  return summary;
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
  let score = mine * 10 - theirs * 6 + (queen && (state.pocketed[me] > 0 || mine) ? 8 : 0);
  if (state.queen.state === 'pending' && state.queen.by === me) score += mine ? 12 : -10;
  if (foul) score -= 18 + mine * 10;
  // Leave the opponent little: own coins near pockets are good, theirs are bad.
  for (const p of s.pieces) {
    if (!p.inPlay || p.kind !== 'coin') continue;
    const d = Math.min(...POCKETS.map(([x, y]) => Math.hypot(p.x - x, p.y - y)));
    if (d < 140) score += (p.color === me ? 0.6 : -0.8) * (1 - d / 140);
  }
  return { score, mine, theirs, foul, queen };
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
 * skill 0–1 adds aiming noise for a beatable opponent.
 */
export function chooseShot(state, { skill = 0.75, rand = Math.random, budget = 90 } = {}) {
  const me = state.turn;
  const y = BASE_Y[side(me)];
  const targets = state.pieces.filter((p) => p.inPlay && (p.color === me || (p.kind === 'queen' && (state.pocketed[me] > 0))));
  const cands = [];
  for (let xi = 0; xi <= 16; xi++) {
    const x = BASE_X[0] + ((BASE_X[1] - BASE_X[0]) * xi) / 16;
    if (!strikerFree(state, x, me)) continue;
    for (const t of targets) {
      for (const [px, py] of POCKETS) {
        const ux = px - t.x, uy = py - t.y, ul = Math.hypot(ux, uy);
        const cx = t.x - (ux / ul) * (t.r + STRIKER_R), cy = t.y - (uy / ul) * (t.r + STRIKER_R);
        const sx = cx - x, sy = cy - y, sl = Math.hypot(sx, sy);
        const cut = (sx * ux + sy * uy) / (sl * ul); // cos of the cut angle
        if (cut < 0.3) continue;
        if (!pathClear(state, t.x, t.y, px, py, t.r, t)) continue;
        if (!pathClear(state, x, y, cx, cy, STRIKER_R, t)) continue;
        const dist = sl + ul;
        const power = Math.min(1, 0.22 + dist / 1500 / Math.max(0.45, cut));
        cands.push({ x, angle: Math.atan2(sy, sx), power, h: cut * 3 - dist / 400 + (t.kind === 'queen' ? 1 : 0) });
      }
    }
  }
  // Fallback: break or a firm shot at the middle.
  if (!cands.length) {
    for (let xi = 0; xi <= 8; xi++) {
      const x = BASE_X[0] + ((BASE_X[1] - BASE_X[0]) * xi) / 8;
      if (!strikerFree(state, x, me)) continue;
      cands.push({ x, angle: Math.atan2(CENTER - y, CENTER - x), power: 0.85, h: 0 });
    }
  }
  if (!cands.length) cands.push({ x: CENTER, angle: me === 'white' ? -Math.PI / 2 : Math.PI / 2, power: 0.8, h: 0 });
  cands.sort((a, b) => b.h - a.h);
  let best = null;
  const pool = cands.slice(0, budget);
  for (const c of pool) {
    for (const dp of [0, 0.12, -0.08]) {
      const shot = { x: c.x, angle: c.angle, power: Math.min(1, Math.max(0.15, c.power + dp)) };
      const r = simulate(state, shot);
      if (!best || r.score > best.score) best = { ...shot, score: r.score };
    }
  }
  const noise = (1 - skill) * 0.06;
  return { x: best.x, angle: best.angle + (rand() - 0.5) * 2 * noise, power: Math.min(1, best.power * (1 + (rand() - 0.5) * noise * 2)) };
}
