// Kontrola při uložení turnaje / sezóny ligy (Sveltia CMS preSave). Chyba zastaví uložení a ukáže se v hlášce.
// Hlídá data a hodnoty, které patří jen jednomu ročníku: po „Duplikovat“ v nich zůstane odkaz na přihlášku,
// výsledky nebo video z minulého roku. Seznam použitých hodnot je ve stav.json (src/pages/admin/stav.json.ts).
(function () {
  const CMS = window.CMS;
  if (!CMS || !CMS.registerEventListener) return;

  let usedPromise = null;
  const loadUsed = () => (usedPromise ??= fetch('stav.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {})).then((j) => j.used || null).catch(() => null));

  // Stejný klíč jako resultsKey() ve stav.json.ts.
  function resultsKey(div, rows) {
    const text = div + '=' + rows.map((r) => `${r.place}:${r.player ?? r.name ?? ''}`).join('|');
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  const day = (v) => (v ? String(v).slice(0, 10) : '');

  CMS.registerEventListener({
    name: 'preSave',
    handler: async ({ entry }) => {
      const coll = entry.get('collection');
      if (coll !== 'editions' && coll !== 'league_editions') return;
      const d = entry.get('data').toJS();
      const id = d.competition && d.year ? `${d.competition}/${d.year}` : '';
      const problems = [];
      const start = day(d.start_date), end = day(d.end_date), deadline = day(d.signup_deadline);
      if (start && d.year && start.slice(0, 4) !== String(d.year)) problems.push(`Rok ${d.year} nesedí se začátkem ${start}.`);
      if (start && end && end < start) problems.push('Konec je dřív než začátek.');
      if (start && deadline && deadline > start) problems.push('Přihlášky končí až po začátku.');

      const used = await loadUsed();
      if (used) {
        const other = (map, v) => (v && map && map[v] && map[v] !== id ? map[v] : null);
        // Odkazy smí sdílet ročníky téhož roku (páteční junioři, sobotní turnaj, nedělní dvojice mají jednu přihlášku).
        const otherYear = (map, v) => (v && map && [].concat(map[v] || []).find((o) => o !== id && o.split('/')[1] !== String(d.year))) || null;
        const copied = (label, from) => problems.push(`${label} je stejný jako u ročníku ${from} z jiného roku (zkopírovaný?). Smažte ho nebo vložte nový.`);
        const signup = d.signup_url || (d.links && d.links.signup_url);
        let from;
        if ((from = otherYear(used.signup, signup))) copied('Odkaz na přihlášku', from);
        if ((from = otherYear(used.sol, d.sol_lit_url))) copied('Odkaz na SoL lit', from);
        if ((from = otherYear(used.video, d.final_video))) copied('Odkaz na video finále', from);
        for (const [div, rows] of Object.entries(d.results || {})) {
          if (Array.isArray(rows) && rows.length && (from = other(used.results, resultsKey(div, rows)))) {
            problems.push(`Konečné pořadí je stejné jako u ročníku ${from} (zkopírované?). Smažte ho.`);
          }
        }
      }
      if (problems.length) throw new Error(`Neuloženo: ${problems.join(' ')}`);
    },
  });
})();
