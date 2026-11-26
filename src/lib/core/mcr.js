// Czech Championship (MČR) points: millesimal rule.
// Winner gets `top`, last gets 1, linear in between: 1 + (top-1)*(N-place)/(N-1).
// Players sharing a place get the average of the places they cover.

export function linearPoints(place, n, top) {
  if (n <= 1) return top;
  return 1 + ((top - 1) * (n - place)) / (n - 1);
}

/** results: [{place, player}] (already filtered to eligible players, any order). Returns Map player -> points (unrounded). */
export function editionPoints(results, top) {
  const sorted = [...results].sort((a, b) => a.place - b.place);
  const n = sorted.length;
  const out = new Map();
  // re-rank: consecutive positions; equal original places share
  let pos = 1;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].place === sorted[i].place) j++;
    const k = j - i + 1;
    let sum = 0;
    for (let p = pos; p < pos + k; p++) sum += linearPoints(p, n, top);
    for (let t = i; t <= j; t++) out.set(sorted[t].player, sum / k);
    pos += k;
    i = j + 1;
  }
  return out;
}

const round = (x, mode) => (mode === 'whole' ? Math.round(x) : Math.round(x * 2) / 2);

/** Pick the best `bestOf` values; returns array of booleans (counted) aligned with points. */
function counted(points, bestOf) {
  const idx = points.map((p, i) => [p, i]).filter(([p]) => p != null).sort((a, b) => b[0] - a[0]).slice(0, bestOf).map(([, i]) => i);
  return points.map((_, i) => idx.includes(i));
}

function placeRows(rows) {
  rows.sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => {
    r.place = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].place : i + 1;
  });
  return rows;
}

/**
 * ranking: data/rankings/mcr-<year>.yaml
 * editions: { "jarni/2025": edition, ... }; players: { slug: player }
 */
export function rankingTable(ranking, editions, players, defaults = {}) {
  const best = ranking.best_of ?? defaults.best_of ?? 2;
  const cols = ranking.editions ?? [];
  if (ranking.points === 'published') {
    const rows = Object.entries(ranking.standings ?? {}).map(([player, pts]) => {
      const points = cols.map((_, i) => (pts?.[i] ?? null));
      const c = counted(points, best);
      return { player, points, counted: c, total: points.reduce((s, p, i) => s + (c[i] ? p : 0), 0) };
    });
    return { columns: cols, scale: ranking.scale ?? 100, mode: 'published', rows: placeRows(rows) };
  }
  const top = ranking.top_points ?? defaults.top_points ?? 1000;
  const mode = ranking.rounding ?? defaults.rounding ?? 'whole';
  const per = cols.map((id) => {
    const res = editions[id]?.results?.singles ?? [];
    const eligible = res.filter((r) => players[r.player]?.mcr);
    return editionPoints(eligible, top);
  });
  const all = new Set(per.flatMap((m) => [...m.keys()]));
  const rows = [...all].map((player) => {
    const points = per.map((m) => (m.has(player) ? round(m.get(player), mode) : null));
    const c = counted(points, best);
    return { player, points, counted: c, total: points.reduce((s, p, i) => s + (c[i] ? p : 0), 0) };
  });
  return { columns: cols, scale: top, mode: 'computed', rows: placeRows(rows) };
}

/**
 * For published years: run the formula on imported places and list differences (report only).
 */
export function checkPublished(ranking, editions, players) {
  if (ranking.points !== 'published' || ranking.check === false) return [];
  const report = [];
  const scale = ranking.scale ?? 100;
  (ranking.editions ?? []).forEach((id, i) => {
    const res = editions[id]?.results?.singles;
    if (!res?.length) { report.push({ edition: id, status: 'not-checked', note: 'chybí pořadí turnaje' }); return; }
    const eligible = res.filter((r) => players[r.player]?.mcr);
    const formula = editionPoints(eligible, scale);
    const diffs = [];
    for (const [player, f] of formula) {
      const pub = ranking.standings?.[player]?.[i];
      if (pub == null || Math.abs(pub - f) > 0.01) diffs.push({ player, published: pub ?? null, formula: Math.round(f * 100) / 100 });
    }
    report.push({ edition: id, status: diffs.length ? 'differs' : 'ok', count: eligible.length, diffs });
  });
  return report;
}
