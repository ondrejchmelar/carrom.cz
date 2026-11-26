// PCL league logic: group-stage table, playoff bracket and final places.
// Pure functions, shared by the Astro build and the node tools/tests.

/** "25:11" -> [25, 11]; returns null for anything else. */
export function parseScore(s) {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/.exec(String(s ?? ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const DEFAULT_POINTS = { win: 2, draw: 1 };

function emptyRow(player) {
  return { player, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, points: 0 };
}

function tally(matches, players, pts = DEFAULT_POINTS) {
  const rows = new Map(players.map((p) => [p, emptyRow(p)]));
  for (const m of matches) {
    const A = rows.get(m.a), B = rows.get(m.b);
    if (!A || !B) continue;
    A.played++; B.played++;
    A.scored += m.sa; A.conceded += m.sb; B.scored += m.sb; B.conceded += m.sa;
    if (m.sa > m.sb) { A.won++; B.lost++; A.points += pts.win; }
    else if (m.sb > m.sa) { B.won++; A.lost++; B.points += pts.win; }
    else { A.drawn++; B.drawn++; A.points += pts.draw; B.points += pts.draw; }
  }
  return [...rows.values()];
}

const diff = (r) => r.scored - r.conceded;

/**
 * Flattens evening files into matches and collects warnings.
 * evenings: [{ id, date, matches: [{a, b, score, forfeit}] }]
 */
export function collectMatches(evenings, roster, { legs = 1 } = {}) {
  const inRoster = new Set(roster.map((r) => r.player));
  const withdrawn = new Set(roster.filter((r) => r.withdrawn).map((r) => r.player));
  const warnings = [];
  const matches = [];
  const pairs = new Map();
  for (const ev of evenings) {
    for (const [i, m] of (ev.matches ?? []).entries()) {
      const where = `${ev.id} zápas ${i + 1}`;
      const sc = parseScore(m.score);
      if (!sc) { warnings.push(`${where}: skóre „${m.score}“ není ve tvaru 25:11`); continue; }
      for (const p of [m.a, m.b]) if (!inRoster.has(p)) warnings.push(`${where}: ${p} není na soupisce`);
      if (m.a === m.b) { warnings.push(`${where}: hráč hraje sám se sebou`); continue; }
      const key = [m.a, m.b].sort().join('|');
      const n = (pairs.get(key) ?? 0) + 1;
      pairs.set(key, n);
      if (n > legs) warnings.push(`${where}: dvojice ${m.a} – ${m.b} už spolu hrála`);
      if (withdrawn.has(m.a) || withdrawn.has(m.b)) continue; // annulled
      matches.push({ a: m.a, b: m.b, sa: sc[0], sb: sc[1], date: ev.date ?? null, forfeit: !!m.forfeit, evening: ev.id });
    }
  }
  return { matches, warnings };
}

/**
 * Group-stage standings. Tiebreak (propozice PCL): points, score difference,
 * head-to-head points, head-to-head difference, points scored.
 */
export function standings(players, matches, { points = DEFAULT_POINTS, legs = 1 } = {}) {
  const rows = tally(matches, players, points);
  rows.sort((x, y) => y.points - x.points || diff(y) - diff(x));
  const out = [];
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].points === rows[i].points && diff(rows[j + 1]) === diff(rows[i])) j++;
    const grp = rows.slice(i, j + 1);
    if (grp.length > 1) {
      const names = grp.map((r) => r.player);
      const h2h = new Map(
        tally(matches.filter((m) => names.includes(m.a) && names.includes(m.b)), names, points).map((r) => [r.player, r]),
      );
      grp.sort((x, y) => {
        const hx = h2h.get(x.player), hy = h2h.get(y.player);
        return hy.points - hx.points || diff(hy) - diff(hx) || y.scored - x.scored;
      });
    }
    out.push(...grp);
    i = j + 1;
  }
  const total = (players.length - 1) * legs;
  return out.map((r, i) => ({ ...r, diff: diff(r), remaining: Math.max(0, total - r.played), place: i + 1 }));
}

// ---------- playoff ----------

/** Slot layout of one group of 8 (pcl-8). Seeds are 1..8 inside the group. */
export const PCL8 = [
  { id: 'qf1', round: 'qf', label: { cs: 'Čtvrtfinále 1', en: 'Quarter-final 1' }, from: [['seed', 1], ['seed', 8]] },
  { id: 'qf2', round: 'qf', label: { cs: 'Čtvrtfinále 2', en: 'Quarter-final 2' }, from: [['seed', 5], ['seed', 4]] },
  { id: 'qf3', round: 'qf', label: { cs: 'Čtvrtfinále 3', en: 'Quarter-final 3' }, from: [['seed', 3], ['seed', 6]] },
  { id: 'qf4', round: 'qf', label: { cs: 'Čtvrtfinále 4', en: 'Quarter-final 4' }, from: [['seed', 7], ['seed', 2]] },
  { id: 'sf1', round: 'sf', label: { cs: 'Semifinále 1', en: 'Semi-final 1' }, from: [['w', 'qf1'], ['w', 'qf2']] },
  { id: 'sf2', round: 'sf', label: { cs: 'Semifinále 2', en: 'Semi-final 2' }, from: [['w', 'qf3'], ['w', 'qf4']] },
  { id: 'l-sf1', round: 'sf', lower: true, label: { cs: 'O 5.–8. místo (1)', en: '5th–8th place (1)' }, from: [['l', 'qf1'], ['l', 'qf2']] },
  { id: 'l-sf2', round: 'sf', lower: true, label: { cs: 'O 5.–8. místo (2)', en: '5th–8th place (2)' }, from: [['l', 'qf3'], ['l', 'qf4']] },
  { id: 'f1', round: 'f', places: [1, 2], label: { cs: 'Finále', en: 'Final' }, from: [['w', 'sf1'], ['w', 'sf2']] },
  { id: 'f3', round: 'f', places: [3, 4], label: { cs: 'O 3. místo', en: 'Third place' }, from: [['l', 'sf1'], ['l', 'sf2']] },
  { id: 'f5', round: 'f', lower: true, places: [5, 6], label: { cs: 'O 5. místo', en: 'Fifth place' }, from: [['w', 'l-sf1'], ['w', 'l-sf2']] },
  { id: 'f7', round: 'f', lower: true, places: [7, 8], label: { cs: 'O 7. místo', en: 'Seventh place' }, from: [['l', 'l-sf1'], ['l', 'l-sf2']] },
];

const FEED = { w: { cs: 'Vítěz', en: 'Winner' }, l: { cs: 'Poražený', en: 'Loser' } };
const SHORT = {
  qf1: ['ČF1', 'QF1'], qf2: ['ČF2', 'QF2'], qf3: ['ČF3', 'QF3'], qf4: ['ČF4', 'QF4'],
  sf1: ['SF1', 'SF1'], sf2: ['SF2', 'SF2'], 'l-sf1': ['O 5.–8. (1)', '5–8 (1)'], 'l-sf2': ['O 5.–8. (2)', '5–8 (2)'],
};

/** Winner index (0 top, 1 bottom) of a best-of-N series, or null while undecided. */
export function seriesWinner(games, bestOf) {
  const need = Math.floor(bestOf / 2) + 1;
  let a = 0, b = 0;
  for (const g of games ?? []) {
    const s = parseScore(g);
    if (!s) continue;
    if (s[0] > s[1]) a++; else if (s[1] > s[0]) b++;
  }
  if (a >= need) return 0;
  if (b >= need) return 1;
  return null;
}

function parseGroup(key) {
  const m = /^(\d+)-(\d+)$/.exec(key);
  return m ? { first: Number(m[1]), last: Number(m[2]) } : null;
}

/**
 * Builds one bracket group.
 * seeds: overall seed list (index 0 = seed 1). groupKey: "1-8" or "9-16".
 * games: { qf1: ["25:0", ...], ... }; bestOf: { "1-8": 3, "1-8/5-8": 1, "9-16": 1 }.
 */
export function buildGroup(groupKey, seeds, games = {}, bestOf = {}, winners = {}) {
  const g = parseGroup(groupKey);
  const offset = g.first - 1;
  const groupSeeds = seeds.slice(offset, offset + 8);
  if (groupSeeds.length < 2) return null; // not enough players for this group
  if (groupSeeds.length < 8) {
    // A short group (e.g. 10 players: seeds 9 and 10) plays one match for its top place, as in PCL 2026.
    // The rest of a short group keeps its table places.
    const first = g.first;
    const players = [0, 1].map((i) => ({ player: groupSeeds[i], seed: first + i }));
    const list = games.f1 ?? [];
    const winner = seriesWinner(list, bestOf[groupKey] ?? 1);
    const slot = {
      id: 'f1', round: 'f', places: [first, first + 1], bestOf: bestOf[groupKey] ?? 1, players,
      label: { cs: `O ${first}. místo`, en: `Place ${first}` },
      games: list.map((x) => parseScore(x)).filter(Boolean), winner,
    };
    const places = winner === null ? [] : [{ place: first, player: players[winner].player }, { place: first + 1, player: players[1 - winner].player }];
    return { key: groupKey, first, last: first + 1, mini: true, slots: [slot], places, complete: winner !== null, next: winner === null ? 'f1' : null };
  }
  const bo = (slot) => bestOf[`${groupKey}/${slot.id}`] ?? (slot.lower ? bestOf[`${groupKey}/5-8`] : undefined) ?? bestOf[groupKey] ?? 1;
  const bySlot = {};
  const slots = PCL8.map((def) => {
    const players = def.from.map(([kind, ref]) => {
      if (kind === 'seed') return { player: groupSeeds[ref - 1], seed: ref + offset };
      const prev = bySlot[ref];
      if (!prev || prev.winner === null) return { player: null, feed: `${FEED[kind].cs} ${SHORT[ref][0]}`, feedEn: `${FEED[kind].en} ${SHORT[ref][1]}` };
      return prev.players[kind === 'w' ? prev.winner : 1 - prev.winner];
    });
    const ready = players.every((p) => p.player);
    const list = games[def.id] ?? [];
    // winners: set by hand for an old series the scores cannot decide (a drawn game, a walkover without a score)
    const winner = ready ? seriesWinner(list, bo(def)) ?? (winners[def.id] === 0 || winners[def.id] === 1 ? winners[def.id] : null) : null;
    const slot = {
      ...def,
      bestOf: bo(def),
      players,
      games: list.map((x) => parseScore(x)).filter(Boolean),
      winner,
      places: def.places?.map((p) => p + offset),
    };
    bySlot[def.id] = slot;
    return slot;
  });
  const places = [];
  for (const s of slots) {
    if (!s.places || s.winner === null) continue;
    places.push({ place: s.places[0], player: s.players[s.winner].player });
    places.push({ place: s.places[1], player: s.players[1 - s.winner].player });
  }
  const next = slots.find((s) => s.winner === null && s.players.every((p) => p.player)) ?? null;
  return { key: groupKey, first: g.first, last: g.last, slots, places: places.sort((a, b) => a.place - b.place), complete: places.length === 8, next: next?.id ?? null };
}

/**
 * Whole season: table, seeds, bracket and final places.
 * edition: data/editions/pcl/<year>.yaml; evenings: data/leagues/pcl-<year>/*.yaml (without playoff.yaml)
 */
export function season(edition, evenings, playoff) {
  const fmt = edition.format ?? {};
  const gs = fmt.group_stage ?? {};
  const legs = gs.legs ?? 1;
  const roster = (edition.roster ?? []).map((r) => (typeof r === 'string' ? { player: r } : r));
  const { matches, warnings } = collectMatches(evenings, roster, { legs });
  const active = roster.filter((r) => !r.withdrawn).map((r) => r.player);
  const playedSet = new Set(matches.flatMap((m) => [m.a, m.b]));
  const phase = edition.phase ?? 'group';
  // During the group stage everyone on the roster is in the table; afterwards only players who played.
  const inTable = phase === 'group' ? active : active.filter((p) => playedSet.has(p));
  const table = standings(inTable, matches, { points: gs.points, legs });
  const idle = active.filter((p) => !inTable.includes(p));

  let groups = [];
  let seeds = [];
  if (phase !== 'group' && playoff) {
    seeds = Array.isArray(playoff.seeds) ? playoff.seeds : table.map((r) => r.player);
    for (const key of fmt.playoff?.groups ?? ['1-8']) {
      const grp = buildGroup(key, seeds, playoff.games?.[key], fmt.playoff?.best_of, playoff.winners?.[key]);
      if (grp) groups.push(grp);
    }
  }
  // Final places: bracket places where decided, table places for everyone outside a bracket.
  const inBracket = new Set(groups.flatMap((g) => seeds.slice(g.first - 1, g.last)));
  const finalPlaces = [
    ...groups.flatMap((g) => g.places),
    ...table.filter((r) => !inBracket.has(r.player)).map((r) => ({ place: r.place, player: r.player })),
  ].sort((a, b) => a.place - b.place);
  const complete = phase !== 'group' && groups.every((g) => g.complete);
  return { phase, table, idle, matches, warnings, seeds, groups, finalPlaces, complete, roster };
}
