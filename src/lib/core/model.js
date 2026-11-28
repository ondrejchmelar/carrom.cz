// Turns the raw YAML data into the model the pages use.
// Shared by the Astro build (src/lib/data.ts) and the node tools (tools/load.mjs).
import { season } from './pcl.js';
import { rankingTable, checkPublished } from './mcr.js';

const DIVISION_LABEL = {
  singles: { cs: 'Jednotlivci', en: 'Singles' },
  doubles: { cs: 'Dvojice', en: 'Doubles' },
  juniors: { cs: 'Junioři', en: 'Juniors' },
  women: { cs: 'Ženy', en: 'Women' },
  teams: { cs: 'Družstva', en: 'Teams' },
};
export const divisionLabel = (d) => DIVISION_LABEL[d] ?? { cs: d, en: d };

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d) : null);

export function buildModel(raw, { today = new Date() } = {}) {
  const warnings = [];
  const { competitions = {}, players = {}, clubs = {}, documents = {} } = raw;

  // ---------- editions ----------
  const editions = {};
  for (const [id, e] of Object.entries(raw.editions ?? {})) {
    const [code, year] = id.split('/');
    const comp = competitions[e.competition ?? code];
    if (!comp) warnings.push(`editions/${id}: neznámá soutěž ${e.competition ?? code}`);
    editions[id] = {
      ...e,
      id,
      code,
      year: Number(year),
      start_date: iso(e.start_date),
      end_date: iso(e.end_date ?? e.start_date),
      signup_deadline: iso(e.signup_deadline),
      competition: comp ? { ...comp, code } : { code, name: { cs: code, en: code } },
      results: e.results ?? {},
    };
  }

  // ---------- leagues (PCL-style seasons) ----------
  const seasons = {};
  for (const [id, lg] of Object.entries(raw.leagues ?? {})) {
    const m = /^([a-z0-9]+)-(\d{4})$/.exec(id);
    if (!m) continue;
    const ed = editions[`${m[1]}/${m[2]}`];
    if (!ed) { warnings.push(`leagues/${id}: chybí ročník editions/${m[1]}/${m[2]}.yaml`); continue; }
    const s = season(ed, lg.evenings ?? [], lg.playoff);
    s.warnings.forEach((w) => warnings.push(`leagues/${id}: ${w}`));
    s.evenings = (lg.evenings ?? []).map((ev) => ({ ...ev, date: iso(ev.date) }));
    s.hasPlayoff = !!lg.playoff;
    seasons[ed.id] = s;
    // Final places come from the build once the playoff is complete; never typed by hand.
    if (s.complete && !(ed.results.singles?.length)) {
      ed.results = { ...ed.results, singles: s.finalPlaces };
      ed.resultsComputed = true;
    }
  }

  // ---------- status moves forward on its own from the data (Ondrej, 2026-11-27) ----------
  // The typed status stays in status_set; a hand-set later status (e.g. finished) always wins.
  const todayIso0 = iso(today);
  for (const ed of Object.values(editions)) {
    ed.status_set = ed.status ?? 'planned';
    ed.status = autoStatus(ed, seasons[ed.id], todayIso0);
    ed.status_auto = ed.status !== ed.status_set;
  }

  // ---------- abroad (Eurocup): only editions with Czech players (Ondrej, 2026-11-26) ----------
  const isCzech = (r) => r.country === 'CZ' || (r.player != null && (players[r.player]?.country ?? 'CZ') === 'CZ');
  for (const [id, ed] of Object.entries(editions)) {
    if (ed.competition.category !== 'abroad') continue;
    ed.czech = Object.values(ed.results).some((rows) => (rows ?? []).some(isCzech));
    if (!ed.czech && ed.status === 'finished') delete editions[id];
  }

  for (const ed of Object.values(editions)) {
    if (ed.final_video && !/(?:youtu\.be\/|[?&]v=|\/(?:embed|live|shorts)\/)[A-Za-z0-9_-]{11}/.test(String(ed.final_video)))
      warnings.push(`editions/${ed.id}: final_video není odkaz na YouTube video`);
  }

  // ---------- references ----------
  for (const ed of Object.values(editions)) {
    for (const [div, rows] of Object.entries(ed.results ?? {})) {
      for (const r of rows ?? []) {
        if (r.player == null && r.name) continue; // plain name (e.g. foreign players at the Eurocup)
        if (r.player == null && r.hidden) continue; // player hidden in SoL (name not published)
        if (!players[r.player]) warnings.push(`editions/${ed.id}: ${div} – neznámý hráč ${r.player ?? '(bez jména)'}`);
      }
    }
  }

  // ---------- propozice: generated PDF unless one is uploaded (documents kind propozice) or switched off ----------
  for (const ed of Object.values(editions)) {
    const uploaded = Object.values(documents).some((d) => d.edition === ed.id && d.kind === 'propozice');
    ed.propoziceAuto = (ed.propozice ?? 'auto') === 'auto' && !uploaded && ed.status !== 'finished';
  }

  // Undated (old) editions sort by their year instead of all landing first.
  const sortKey = (e) => e.start_date ?? String(e.year);
  const editionList = Object.values(editions).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const todayIso = iso(today);
  const upcoming = editionList.filter((e) => (e.end_date ?? e.start_date) >= todayIso && e.status !== 'finished');
  const nextTournament =
    upcoming.find((e) => e.competition.kind === 'tournament' && ['planned', 'registration_open'].includes(e.status)) ?? null;

  // ---------- rankings ----------
  const rankings = {};
  for (const [id, r] of Object.entries(raw.rankings ?? {})) {
    const table = rankingTable(r, editions, players, raw.settings?.mcr);
    rankings[id] = { ...r, id, year: Number(r.year), table, check: checkPublished(r, editions, players) };
    for (const c of rankings[id].check) {
      if (c.status === 'differs') warnings.push(`rankings/${id}: ${c.edition} – ${c.diffs.length} rozdílů mezi zveřejněnými body a vzorcem (jen hlášení)`);
    }
  }
  const latestRanking = Object.values(rankings)
    .filter((r) => r.table.rows.length)
    .sort((a, b) => b.year - a.year)[0] ?? null;

  // ---------- players ----------
  const resultsByPlayer = {};
  for (const ed of editionList) {
    for (const [division, rows] of Object.entries(ed.results ?? {})) {
      for (const r of rows ?? []) {
        if (r.player == null) continue;
        (resultsByPlayer[r.player] ??= []).push({ edition: ed, division, place: r.place });
      }
    }
  }
  const pp = raw.settings?.player_page ?? { min_wins: 1, min_results: 5 };
  const playerInfo = {};
  for (const [slug, p] of Object.entries(players)) {
    const res = (resultsByPlayer[slug] ?? []).sort((a, b) => (b.edition.start_date ?? '').localeCompare(a.edition.start_date ?? ''));
    const wins = res.filter((r) => r.place === 1).length;
    const auto = wins >= (pp.min_wins ?? 1) || res.length >= (pp.min_results ?? 5);
    const hasPage = p.page === 'always' ? true : p.page === 'never' ? false : auto;
    playerInfo[slug] = { slug, ...p, results: res, wins, hasPage };
  }

  const gallery = (raw.gallery?.albums ?? []).map((a) => ({ ...a, year: Number(a.year) }));
  for (const a of gallery) {
    if (!a.url) warnings.push(`gallery: album „${a.title?.cs ?? '?'}“ nemá odkaz`);
    if (a.edition && !editions[a.edition]) warnings.push(`gallery: album „${a.title?.cs ?? '?'}“ – neznámý ročník ${a.edition}`);
  }
  return {
    settings: raw.settings ?? {},
    navigation: raw.navigation ?? {},
    home: raw.home ?? {},
    roles: raw.roles ?? {},
    redirects: raw.redirects ?? {},
    gallery,
    competitions,
    editions,
    editionList,
    upcoming,
    nextTournament,
    seasons,
    rankings,
    latestRanking,
    players: playerInfo,
    clubs: Object.entries(clubs).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    documents: Object.entries(documents).map(([id, d]) => ({ id, ...d, date: iso(d.date) })),
    warnings,
  };
}

const STATUS_ORDER = { planned: 0, registration_open: 1, running: 2, finished: 3 };
const hasAnyResults = (ed) => Object.values(ed.results ?? {}).some((rows) => (rows ?? []).length > 0);

/**
 * Status implied by the data, never earlier than the typed one:
 * sign-up link (deadline not passed) -> registration_open; league after its start -> running;
 * league with the playoff complete, or results after the end date -> finished.
 */
export function autoStatus(ed, season, todayIso) {
  const set = ed.status ?? 'planned';
  const league = ed.competition?.kind === 'league';
  const signup = ed.signup_url ?? ed.links?.signup_url;
  const end = ed.end_date ?? ed.start_date;
  let s = 'planned';
  if (signup && (!ed.signup_deadline || ed.signup_deadline >= todayIso)) s = 'registration_open';
  if (league && ed.start_date && ed.start_date <= todayIso) s = 'running';
  if (season?.complete || (hasAnyResults(ed) && end && end < todayIso)) s = 'finished';
  return (STATUS_ORDER[s] ?? 0) > (STATUS_ORDER[set] ?? 0) ? s : set;
}
