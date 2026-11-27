// „Postup ročníku“ v náhledu formuláře turnaje / sezóny ligy (Sveltia CMS preview template).
// Kroky se počítají živě z rozpracovaného formuláře; co formulář nevidí (žebříček, nahrané
// propozice, hrací večery) doplní stav.json, který se vytvoří při sestavení webu.
(function () {
  const CMS = window.CMS;
  if (!CMS || !CMS.registerPreviewTemplate) return;
  const h = CMS.React.createElement;
  const { useEffect, useState } = CMS.React;
  const SOL = 'https://github.com/ondrejchmelar/carrom.cz/actions/workflows/sol-import.yml';

  let ctxPromise = null;
  const loadCtx = () => (ctxPromise ??= fetch('stav.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

  const val = (entry, path) => {
    const v = entry.getIn(['data', ...path]);
    return v && v.toJS ? v.toJS() : v;
  };
  const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '');

  function steps(entry, ctx, league) {
    const status = val(entry, ['status']);
    const finished = status === 'finished';
    const results = val(entry, ['results']) || {};
    const hasResults = Object.values(results).some((rows) => Array.isArray(rows) && rows.length > 0);
    const prop = (val(entry, ['propozice']) || 'auto') !== 'none';
    const propDone = !!ctx.uploadedPropozice || !!ctx.pdf || (prop && !finished);
    const S = (label, state, hint) => ({ label, state, hint });
    const prep = (ok) => (ok ? 'done' : finished ? 'skip' : 'todo');
    if (league) {
      const signup = filled(val(entry, ['links', 'signup_url'])) || filled(val(entry, ['roster']));
      return [
        S('Založena', 'done'),
        S('Propozice', prep(propDone), 'Vytvoří se samy z údajů sezóny (pole Propozice), nebo nahrajte PDF v Dokumentech.'),
        S('Přihlášky', prep(signup), 'Vyplňte odkaz na Google formulář s přihláškou do sezóny.'),
        S('Průběh', prep(ctx.evenings > 0 || hasResults), 'Zapisujte hrací večery (Ligy · PCL hrací večery).'),
        S('Konečné pořadí', hasResults || ctx.playoffDone ? 'done' : 'todo', 'U PCL ho spočítá web z playoff. U ostatních lig vyplňte Konečné pořadí.'),
        S('Skončila', finished ? 'done' : 'todo', 'Po finále přepněte Stav na Odehraný.'),
      ];
    }
    return [
      S('Založen', 'done'),
      S('Propozice', prep(propDone), 'Vytvoří se samy z údajů (pole Propozice). Doplňte startovné a program.'),
      S('Přihlášky', prep(filled(val(entry, ['signup_url']))), 'Vyplňte Přihláška (odkaz na Google Form) a Přihlášky do.'),
      S('Výsledky', hasResults ? 'done' : 'todo', 'Po turnaji spusťte Import ze SoL.'),
      S('Žebříček MČR', ctx.ranking ? (hasResults ? 'done' : 'todo') : 'skip', 'Přepočítá se sám po importu výsledků.'),
      S('Odehráno', finished ? 'done' : 'todo', 'Po turnaji přepněte Stav na Odehraný.'),
    ];
  }

  function Panel({ entry, league }) {
    const [ctxAll, setCtx] = useState(null);
    useEffect(() => { loadCtx().then(setCtx); }, []);
    const comp = val(entry, ['competition']);
    const year = val(entry, ['year']);
    const id = comp && year ? `${comp}/${year}` : null;
    const ctx = (ctxAll && ctxAll.editions && id && ctxAll.editions[id]) || {};
    const st = steps(entry, ctx, league);
    const firstTodo = st.findIndex((s) => s.state === 'todo');
    const todo = st.filter((s) => s.state === 'todo');
    const pill = (s, i) => h('li', { key: s.label, className: `pill ${s.state}${i === firstTodo ? ' now' : ''}` },
      (s.state === 'done' ? '✓ ' : s.state === 'skip' ? '– ' : i === firstTodo ? '● ' : '') + s.label);
    const base = ctxAll && ctxAll.overview ? ctxAll.overview.replace(/admin\/prehled\/$/, '') : '../';
    const links = [];
    if (ctx.page) links.push(h('a', { key: 'p', href: ctx.page, target: '_blank' }, 'Stránka ročníku ↗'));
    if (ctx.pdf) links.push(h('a', { key: 'f', href: ctx.pdf, target: '_blank' }, 'Propozice PDF ↗'));
    if (!league && todo.some((s) => s.label === 'Výsledky')) links.push(h('a', { key: 's', href: SOL, target: '_blank' }, 'Import ze SoL ↗'));
    if (ctxAll && ctxAll.overview) links.push(h('a', { key: 'o', href: ctxAll.overview, target: '_top' }, 'Přehled všech ročníků'));
    return h('div', { className: 'postup' },
      h('div', { className: 'card' },
        h('div', { className: 'eyebrow' }, league ? 'Postup sezóny' : 'Postup turnaje'),
        h('div', { className: 'title' }, id ? `${comp} ${year}` : 'Nový ročník'),
        h('ol', { className: 'pills' }, st.map(pill)),
        todo.length
          ? h('ul', { className: 'todo' }, todo.map((s) => h('li', { key: s.label }, h('b', null, s.label + ': '), s.hint)))
          : h('p', { className: 'ok' }, 'Vše hotovo.'),
        links.length ? h('div', { className: 'links' }, links) : null,
        id && !ctx.page && ctxAll ? h('p', { className: 'note' }, 'Odkazy se objeví po uložení a přestavění webu.') : null,
      ),
      ctx.page ? h('div', { className: 'page' },
        h('div', { className: 'page-head' }, h('b', null, 'Stránka na webu'), h('span', null, 'zveřejněná verze')),
        h('iframe', { src: new URL(ctx.page, location.href).href, title: 'Stránka ročníku na webu', loading: 'lazy' }),
      ) : null,
    );
  }

  CMS.registerPreviewTemplate('editions', (props) => h(Panel, { entry: props.entry, league: false }));
  CMS.registerPreviewTemplate('league_editions', (props) => h(Panel, { entry: props.entry, league: true }));
  CMS.registerPreviewStyle(`
    body { margin: 0; font: 15px/1.45 Figtree, system-ui, sans-serif; color: #0E1B3D; background: #F3F4F7; }
    .postup { padding: 20px; }
    .card { background: #0E1B3D; color: #fff; border-radius: 16px; padding: 20px; }
    .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #F2B33D; }
    .title { font-size: 22px; font-weight: 800; margin: 4px 0 14px; }
    .pills { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { height: 30px; padding: 0 12px; border-radius: 15px; display: flex; align-items: center; font-size: 13px; font-weight: 600; background: rgba(255,255,255,.08); color: #B9C3DD; }
    .pill.done { background: #fff; color: #0E1B3D; }
    .pill.now { background: #D3242B; color: #fff; }
    .pill.skip { opacity: .5; }
    .todo { margin: 0 0 14px; padding-left: 18px; font-size: 14px; color: #E6EAF4; display: grid; gap: 6px; }
    .ok, .note { margin: 0 0 14px; font-size: 14px; color: #B9C3DD; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    .page { margin-top: 20px; }
    .page-head { display: flex; justify-content: space-between; align-items: baseline; margin: 0 4px 8px; font-size: 14px; }
    .page-head span { color: #5A6680; }
    .page iframe { display: block; width: 100%; height: 1400px; border: 1px solid #DDE1EA; border-radius: 12px; background: #fff; }
    .links a { height: 36px; padding: 0 14px; border: 1px solid #3A4B78; border-radius: 18px; display: inline-flex; align-items: center; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; }
  `, { raw: true });
})();
