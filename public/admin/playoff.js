// Živý pavouk playoff PCL v náhledu formuláře „Ligy · PCL playoff“ (Sveltia CMS preview template).
// Formulář zůstává seznam zápasů; tady se z rozpracovaných skóre kreslí pavouk se jmény, stejně jako na webu.
// Nasazení a jména dodá stav.json, výpočet je src/lib/core/pcl.js (servírovaný jako pcl.js).
(function () {
  const CMS = window.CMS;
  if (!CMS || !CMS.registerPreviewTemplate) return;
  const h = CMS.React.createElement;
  const { useEffect, useState } = CMS.React;
  // Same files for /admin/ and the helpers' /admin/vysledky/: resolve next to this script.
  const BASE = new URL('.', document.currentScript.src);

  let ready = null;
  const load = () => (ready ??= Promise.all([
    import(new URL('pcl.js', BASE).href),
    fetch(new URL('stav.json', BASE), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([pcl, stav]) => ({ pcl, stav })).catch((e) => ({ error: String(e) })));

  const bestOfText = (n) => (n === 1 ? 'jedna hra' : `na ${Math.floor(n / 2) + 1} vítězné z ${n}`);
  const COLUMNS = [
    { title: 'Čtvrtfinále', ids: ['qf1', 'qf2', 'qf3', 'qf4'] },
    { title: 'Semifinále', ids: ['sf1', 'sf2', 'l-sf1', 'l-sf2'] },
    { title: 'Finále a o umístění', ids: ['f1', 'f3', 'f5', 'f7'] },
  ];

  function Slot({ slot, names }) {
    const row = (p, i) => {
      const won = slot.winner === i, lost = slot.winner === 1 - i;
      const name = p.player ? names[p.player] || p.player : p.feed;
      return h('div', { key: i, className: `pl ${won ? 'won' : ''} ${lost ? 'lost' : ''} ${p.player ? '' : 'tbd'}` },
        h('span', { className: 'seed' }, p.seed ?? ''),
        h('span', { className: 'nm' }, name),
        h('span', { className: 'sc' }, slot.games.map((g, k) => h('b', { key: k, className: g[i] > g[1 - i] ? 'w' : '' }, g[i]))),
      );
    };
    const open = slot.winner === null && slot.players.every((p) => p.player);
    return h('div', { className: `slot ${open ? 'open' : ''}` },
      h('div', { className: 'lab' }, h('span', null, slot.label.cs), h('em', null, bestOfText(slot.bestOf))),
      slot.players.map(row),
    );
  }

  function Group({ grp, names }) {
    if (grp.mini) return h('div', { className: 'grp' }, h('h3', null, `Skupina ${grp.key}`), h(Slot, { slot: grp.slots[0], names }));
    const by = Object.fromEntries(grp.slots.map((s) => [s.id, s]));
    return h('div', { className: 'grp' },
      h('h3', null, `Skupina o ${grp.first}.–${grp.last}. místo`),
      h('div', { className: 'cols' }, COLUMNS.map((c) => h('div', { key: c.title, className: 'col' },
        h('div', { className: 'ct' }, c.title),
        c.ids.map((id) => by[id] && h(Slot, { key: id, slot: by[id], names })),
      ))),
    );
  }

  function Preview({ entry }) {
    const [ctx, setCtx] = useState(null);
    useEffect(() => { load().then(setCtx); }, []);
    if (!ctx) return h('div', { className: 'po' }, 'Načítám pavouka…');
    if (ctx.error) return h('div', { className: 'po' }, 'Pavouka se nepodařilo načíst.');
    const data = entry.get('data').toJS();
    const info = (ctx.stav.playoff || {})[data.league];
    if (!info) return h('div', { className: 'po' }, h('p', { className: 'note' }, `Pro sezónu ${data.league || '…'} zatím web nezná soupisku a tabulku. Pavouk se ukáže po uložení sezóny a zápasů.`));
    const seeds = Array.isArray(data.seeds) ? data.seeds : info.seeds;
    const bestOf = Object.fromEntries(Object.entries(info.best_of || {}).map(([k, v]) => [k, Number(v) || 1]));
    const groups = (info.groups || ['1-8'])
      .map((key) => ctx.pcl.buildGroup(key, seeds, (data.games || {})[key] || {}, bestOf, (data.winners || {})[key] || {}))
      .filter(Boolean);
    const next = groups.flatMap((g) => g.slots.filter((s) => s.id === g.next).map((s) => `${s.label.cs} (skupina ${g.key})`));
    return h('div', { className: 'po' },
      h('div', { className: 'help' },
        h('b', null, 'Jak zapisovat: '),
        'každá hra je jeden řádek ve tvaru horní:dolní (horní hráč = první v pavouku), např. 25:11. ',
        'Na 2 vítězné z 3: zapište 2 hry, a třetí jen když je stav 1:1. Kdo hraje který zápas, doplní pavouk sám.',
        next.length ? h('div', { className: 'next' }, `Teď se hraje: ${next.join(', ')}`) : null,
        info.provisional ? h('div', { className: 'next' }, 'Nasazení je zatím podle průběžné tabulky.') : null,
      ),
      groups.map((g) => h(Group, { key: g.key, grp: g, names: info.names || {} })),
    );
  }

  CMS.registerPreviewTemplate('league_playoff', (props) => h(Preview, { entry: props.entry }));
  CMS.registerPreviewStyle(`
    .po { padding: 20px; font: 14px/1.4 Figtree, system-ui, sans-serif; color: #0E1B3D; }
    .po .help { background: #0E1B3D; color: #E6EAF4; border-radius: 14px; padding: 14px 16px; margin-bottom: 18px; }
    .po .help b { color: #fff; }
    .po .next { margin-top: 8px; color: #F2B33D; font-weight: 700; }
    .po .note { color: #5A6680; }
    .po h3 { font-size: 16px; margin: 0 0 10px; }
    .po .grp { margin-bottom: 22px; }
    .po .cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .po .ct { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #5A6680; margin-bottom: 6px; }
    .po .col { display: flex; flex-direction: column; gap: 8px; }
    .po .slot { background: #fff; border: 1px solid #DDE1EA; border-radius: 10px; padding: 6px 8px; }
    .po .slot.open { border-color: #D3242B; box-shadow: 0 0 0 1px #D3242B; }
    .po .lab { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; font-weight: 700; color: #5A6680; margin-bottom: 2px; }
    .po .lab em { font-style: normal; font-weight: 600; }
    .po .pl { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 6px; align-items: center; min-height: 22px; }
    .po .pl .seed { font-size: 11px; color: #5A6680; }
    .po .pl .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .po .pl.won .nm { font-weight: 800; }
    .po .pl.lost .nm, .po .pl.tbd .nm { color: #8A93A8; }
    .po .pl .sc { display: flex; gap: 4px; font-variant-numeric: tabular-nums; }
    .po .pl .sc b { font-weight: 500; min-width: 18px; text-align: right; }
    .po .pl .sc b.w { font-weight: 800; }
  `, { raw: true });
})();
