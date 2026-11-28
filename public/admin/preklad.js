// Pole „česky + anglicky“ s tlačítkem Přeložit (Ondrej 2026-11-28).
// Překládá Google Gemini přímo z prohlížeče. Klíč (zdarma z https://aistudio.google.com/apikey)
// si každý editor zadá jednou; uloží se jen v jeho prohlížeči, do repozitáře se nedostane.
// Použití v config.yml: { name: report, label: …, widget: cs_en }  → hodnota { cs: …, en: … }
(function () {
  if (!window.CMS) return;
  const h = CMS.React.createElement;
  const { useState } = CMS.React;
  const KEY = 'carrom-gemini-key';
  const MODEL = 'gemini-2.5-flash';

  const plain = (v) => (v && typeof v.toJS === 'function' ? v.toJS() : v) || {};
  const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const setKey = (k) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch (e) {} };

  async function translate(text, key) {
    const prompt = 'Translate this text about a carrom tournament from Czech to English. ' +
      'Keep names of people, clubs and places as they are, keep the word "striker", keep line breaks and Markdown. ' +
      'Reply with the translation only.\n\n' + text;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || `HTTP ${r.status}`);
    const out = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const s = out.map((p) => p.text || '').join('').trim();
    if (!s) throw new Error('prázdná odpověď');
    return s;
  }

  const box = { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' };
  const lab = { fontSize: '13px', fontWeight: 600, opacity: 0.8 };
  const ta = { width: '100%', minHeight: '110px', padding: '8px 10px', font: 'inherit', borderRadius: '6px', border: '1px solid var(--sui-primary-border-color, #c8ccd6)', background: 'var(--sui-textbox-background-color, #fff)', color: 'inherit', resize: 'vertical', boxSizing: 'border-box' };
  const row = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '4px 0' };
  const btn = { padding: '6px 12px', borderRadius: '6px', border: '1px solid #0E1B3D', background: '#0E1B3D', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
  const link = { background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', font: 'inherit', fontSize: '13px', cursor: 'pointer', opacity: 0.8 };

  function Control(props) {
    const v = plain(props.value);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [hasKey, setHasKey] = useState(!!getKey());
    const update = (patch) => props.onChange({ ...v, ...patch });

    const askKey = () => {
      const k = window.prompt('Klíč Google Gemini API (zdarma z aistudio.google.com/apikey). Uloží se jen v tomto prohlížeči. Prázdné = smazat.', getKey());
      if (k === null) return;
      setKey(k.trim()); setHasKey(!!k.trim()); setMsg(k.trim() ? 'Klíč uložen.' : 'Klíč smazán.');
    };
    const run = async () => {
      if (!v.cs || !v.cs.trim()) { setMsg('Nejdřív napište český text.'); return; }
      if (!getKey()) { askKey(); if (!getKey()) return; }
      if (v.en && v.en.trim() && !window.confirm('Přepsat stávající anglický text?')) return;
      setBusy(true); setMsg('Překládám…');
      try { update({ en: await translate(v.cs, getKey()) }); setMsg('Přeloženo. Zkontrolujte a případně upravte.'); }
      catch (e) { setMsg('Překlad se nepovedl: ' + e.message); }
      finally { setBusy(false); }
    };

    return h('div', { style: box, className: props.classNameWrapper },
      h('span', { style: lab }, 'Česky'),
      h('textarea', { id: props.forID, style: ta, value: v.cs || '', onChange: (e) => update({ cs: e.target.value }) }),
      h('div', { style: row },
        h('button', { type: 'button', style: { ...btn, opacity: busy ? 0.6 : 1 }, disabled: busy, onClick: run }, busy ? 'Překládám…' : 'Přeložit do angličtiny ↓'),
        h('button', { type: 'button', style: link, onClick: askKey }, hasKey ? 'Změnit klíč' : 'Zadat klíč'),
        msg && h('span', { style: { fontSize: '13px' } }, msg)),
      h('span', { style: lab }, 'Anglicky'),
      h('textarea', { style: ta, value: v.en || '', onChange: (e) => update({ en: e.target.value }) }));
  }

  CMS.registerFieldType('cs_en', Control);
})();
