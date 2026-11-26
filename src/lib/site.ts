// Small helpers shared by pages: links, translations, dates, names.
import { fullName, plainName, shortNames } from './core/players.js';
export { fullName, plainName, shortNames };

export type Lang = 'cs' | 'en';
export type L10n = { cs?: string; en?: string } | string | null | undefined;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Base-aware link: url('/kalendar/') -> '/carrom.cz/kalendar/' on the GitHub Pages preview. */
export function url(path = '/') {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

/** Pick the language from a { cs, en } pair; falls back to Czech. */
export function t(v: L10n, lang: Lang = 'cs'): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.cs ?? '';
}

/** Page ids used in data/navigation.yaml -> paths. */
const PAGE_PATHS: Record<string, { cs: string; en: string }> = {
  domu: { cs: '/', en: '/en/' },
  en: { cs: '/en/', en: '/' },
  novinky: { cs: '/novinky/', en: '/en/' },
  'hra-carrom': { cs: '/hra-carrom/', en: '/en/the-game/' },
  kalendar: { cs: '/kalendar/', en: '/en/' },
  vysledky: { cs: '/vysledky/', en: '/en/' },
  ligy: { cs: '/ligy/', en: '/en/' },
  galerie: { cs: '/galerie/', en: '/en/' },
  asociace: { cs: '/asociace/', en: '/en/' },
  vice: { cs: '/vice/', en: '/en/' },
};
export function pageUrl(item: { page?: string; url?: string; anchor?: string }, lang: Lang = 'cs') {
  if (item.url) return item.url;
  const p = PAGE_PATHS[item.page ?? 'domu']?.[lang] ?? `/${item.page}/`;
  return url(p) + (item.anchor ? `#${item.anchor}` : '');
}

const MONTHS_CS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const MONTHS_CS_NOM = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const MONTHS_SHORT = ['LED', 'ÚNO', 'BŘE', 'DUB', 'KVĚ', 'ČER', 'ČVC', 'SRP', 'ZÁŘ', 'ŘÍJ', 'LIS', 'PRO'];
const DAYS_CS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** 21. 11. 2026 */
export const dateShort = (iso?: string | null, withYear = true) => {
  if (!iso) return '';
  const x = d(iso);
  return `${x.getUTCDate()}. ${x.getUTCMonth() + 1}.${withYear ? ` ${x.getUTCFullYear()}` : ''}`;
};
/** 21. listopadu 2026 */
export const dateLong = (iso?: string | null, lang: Lang = 'cs') => {
  if (!iso) return '';
  const x = d(iso);
  if (lang === 'en') return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${x.getUTCDate()}. ${MONTHS_CS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
export const weekday = (iso?: string | null) => (iso ? DAYS_CS[d(iso).getUTCDay()] : '');
export const monthShort = (iso: string) => MONTHS_SHORT[d(iso).getUTCMonth()];
export const dayOfMonth = (iso: string) => d(iso).getUTCDate();
export const monthTitle = (iso: string) => `${MONTHS_CS_NOM[d(iso).getUTCMonth()]} ${d(iso).getUTCFullYear()}`;

/** Czech typography: non-breaking space after one-letter prepositions and conjunctions. */
export function nbsp(s = '') {
  return s.replace(/(^|[\s(„])([vVaAsSkKzZoOuUiI])\s+/g, '$1$2 ');
}

/** Name of an edition: its own name, else "<competition> <year>". */
export function editionName(ed: any, lang: Lang = 'cs') {
  return t(ed.edition_name, lang) || `${t(ed.competition?.name, lang)} ${ed.year}`;
}

export function editionUrl(ed: any) {
  if (ed.competition?.kind === 'league') return url(`/ligy/${ed.code}/${ed.year}/`);
  return url(`/vysledky/${ed.code}/${ed.year}/`);
}

export function playerLink(slug: string, players: Record<string, any>) {
  const p = players[slug];
  return p?.hasPage ? url(`/hraci/${slug}/`) : null;
}

/** Points: 95.5 -> "95,5" */
export const num = (n: number | null | undefined) => (n == null ? '–' : String(n).replace('.', ','));
