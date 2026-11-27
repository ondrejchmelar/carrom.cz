// Generated propozice PDFs: /propozice/<code>-<year>.pdf (Czech) and /propozice/<code>-<year>-en.pdf.
import type { APIRoute } from 'astro';
import { model } from '../../lib/data';
import { editionName, editionUrl } from '../../lib/site';
import { propozicePdf } from '../../lib/core/propozice.js';

export function getStaticPaths() {
  const m = model();
  return Object.values(m.editions as Record<string, any>)
    .filter((e) => e.propoziceAuto)
    .flatMap((e) => (['cs', 'en'] as const).map((lang) => ({ params: { id: `${e.code}-${e.year}${lang === 'en' ? '-en' : ''}` }, props: { id: e.id, lang } })));
}

export const GET: APIRoute = async ({ props, site }) => {
  const m = model();
  const ed = m.editions[props.id];
  const lang = props.lang as 'cs' | 'en';
  const ranking = Object.values(m.rankings as Record<string, any>).find((r) => (r.editions ?? []).includes(ed.id));
  const pageUrl = new URL(editionUrl(ed, lang), site ?? 'https://carrom.cz').href;
  const pdf = await propozicePdf(ed, { lang, name: editionName(ed, lang), pageUrl, ranking, payment: m.settings.payment });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } });
};
