// Pole „česky + anglicky“ s tlačítkem Přeložit (Ondrej 2026-11-28).
// Překlad dělá přihlašovací služba adminu na Cloudflare (/translate) s jedním společným klíčem Google Gemini
// uloženým jako Cloudflare secret GEMINI_API_KEY. Klíč se nikdy nedostane do prohlížeče ani do repozitáře;
// služba překládá jen přihlášeným s právem zápisu do repa.
// Použití v config.yml: { name: report, label: …, widget: cs_en }  → hodnota { cs: …, en: … }
(function () {
  if (!window.CMS) return;
  const h = CMS.React.createElement;
  const { useState } = CMS.React;
  const WORKER = 'https://carrom-cz.chmelar-o.workers.dev/translate';

  const plain = (v) => (v && typeof v.toJS === 'function' ? v.toJS() : v) || {};
  const ghToken = () => { try { return (JSON.parse(localStorage.getItem('sveltia-cms.user') || '{}') || {}).token || ''; } catch (e) { return ''; } };

  async function translate(text) {
    const r = await fetch(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ghToken()}` },
      body: JSON.stringify({ text }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503) throw new Error('společný klíč zatím není nastavený v Cloudflare');
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.text;
  }

  const box = { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' };
  const lab = { fontSize: '13px', fontWeight: 600, opacity: 0.8 };
  const ta = { width: '100%', minHeight: '110px', padding: '8px 10px', font: 'inherit', borderRadius: '6px', border: '1px solid var(--sui-primary-border-color, #c8ccd6)', background: 'var(--sui-textbox-background-color, #fff)', color: 'inherit', resize: 'vertical', boxSizing: 'border-box' };
  const row = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '4px 0' };
  const btn = { padding: '6px 12px', borderRadius: '6px', border: '1px solid #0E1B3D', background: '#0E1B3D', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' };

  function Control(props) {
    const v = plain(props.value);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const update = (patch) => props.onChange({ ...v, ...patch });

    const run = async () => {
      if (!v.cs || !v.cs.trim()) { setMsg('Nejdřív napište český text.'); return; }
      if (v.en && v.en.trim() && !window.confirm('Přepsat stávající anglický text?')) return;
      setBusy(true); setMsg('Překládám…');
      try { update({ en: await translate(v.cs) }); setMsg('Přeloženo. Zkontrolujte a případně upravte.'); }
      catch (e) { setMsg('Překlad se nepovedl: ' + e.message); }
      finally { setBusy(false); }
    };

    return h('div', { style: box, className: props.classNameWrapper },
      h('span', { style: lab }, 'Česky'),
      h('textarea', { id: props.forID, style: ta, value: v.cs || '', onChange: (e) => update({ cs: e.target.value }) }),
      h('div', { style: row },
        h('button', { type: 'button', style: { ...btn, opacity: busy ? 0.6 : 1 }, disabled: busy, onClick: run }, busy ? 'Překládám…' : 'Přeložit do angličtiny ↓'),
        msg && h('span', { style: { fontSize: '13px' } }, msg)),
      h('span', { style: lab }, 'Anglicky'),
      h('textarea', { style: ta, value: v.en || '', onChange: (e) => update({ en: e.target.value }) }));
  }

  CMS.registerFieldType('cs_en', Control);
})();
