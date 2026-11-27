// Small helpers shared by pages: links, translations, dates, names.
import { fullName, plainName, shortNames } from './core/players.js';
export { fullName, plainName, shortNames };

export type Lang = 'cs' | 'en';
export type L10n = { cs?: string; en?: string } | string | null | undefined;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Base-aware link: url('/ligy/') -> '/carrom.cz/ligy/' on the GitHub Pages preview. */
export function url(path = '/') {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

/** Czech path -> English path. Order matters: longer prefixes first. */
const EN_PREFIX: [string, string][] = [
  ['/vysledky/rok/', '/en/results/year/'], ['/vysledky/mcr/', '/en/results/mcr/'], ['/vysledky/', '/en/results/'],
  ['/ligy/', '/en/leagues/'], ['/novinky/', '/en/news/'], ['/hraci/', '/en/players/'],
  ['/galerie/', '/en/gallery/'], ['/asociace/', '/en/association/'], ['/hra-carrom/', '/en/the-game/'], ['/vice/', '/en/more/'],
];
/** Path in the given language for a Czech path: lp('/ligy/pcl/2025/', 'en') -> '/en/leagues/pcl/2025/'. */
export function lp(path: string, lang: Lang = 'cs') {
  if (lang !== 'en' || /^(https?:|mailto:|tel:|#)/.test(path)) return path;
  if (path === '/' || path.startsWith('/#')) return `/en${path}`;
  for (const [cs, en] of EN_PREFIX) if (path.startsWith(cs)) return en + path.slice(cs.length);
  return path;
}
/** Czech path for an English path (for the language switch). */
export function csPath(path: string) {
  if (path === '/en/' || path === '/en') return '/';
  for (const [cs, en] of EN_PREFIX) if (path.startsWith(en)) return cs + path.slice(en.length);
  return path.startsWith('/en/') ? '/' : path;
}
/** url() in a language: L('/ligy/', 'en') -> '/carrom.cz/en/leagues/'. */
export const L = (path: string, lang: Lang = 'cs') => url(lp(path, lang));
/** Inline translation: tr(lang, 'Výsledky', 'Results'). */
export const tr = (lang: Lang, cs: string, en: string) => (lang === 'en' ? en : cs);

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
  vysledky: { cs: '/vysledky/', en: '/en/' },
  ligy: { cs: '/ligy/', en: '/en/' },
  galerie: { cs: '/galerie/', en: '/en/' },
  asociace: { cs: '/asociace/', en: '/en/' },
  vice: { cs: '/vice/', en: '/en/' },
};
export function pageUrl(item: { page?: string; url?: string; anchor?: string }, lang: Lang = 'cs') {
  if (item.url) return item.url;
  const p = PAGE_PATHS[item.page ?? 'domu']?.cs ?? `/${item.page}/`;
  if (item.page === 'en') return url(lang === 'en' ? '/' : '/en/');
  return L(p, lang) + (item.anchor ? `#${item.anchor}` : '');
}

const MONTHS_CS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const MONTHS_CS_NOM = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const MONTHS_SHORT = ['LED', 'ÚNO', 'BŘE', 'DUB', 'KVĚ', 'ČER', 'ČVC', 'SRP', 'ZÁŘ', 'ŘÍJ', 'LIS', 'PRO'];
const DAYS_CS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** 21. 11. 2026 */
export const dateShort = (iso?: string | null, withYear = true, lang: Lang = 'cs') => {
  if (!iso) return '';
  const x = d(iso);
  if (lang === 'en') return `${x.getUTCDate()} ${MONTHS_EN[x.getUTCMonth()].slice(0, 3)}${withYear ? ` ${x.getUTCFullYear()}` : ''}`;
  return `${x.getUTCDate()}. ${x.getUTCMonth() + 1}.${withYear ? ` ${x.getUTCFullYear()}` : ''}`;
};
/** 21. listopadu 2026 */
export const dateLong = (iso?: string | null, lang: Lang = 'cs') => {
  if (!iso) return '';
  const x = d(iso);
  if (lang === 'en') return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${x.getUTCDate()}. ${MONTHS_CS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
export const weekday = (iso?: string | null, lang: Lang = 'cs') => (iso ? (lang === 'en' ? DAYS_EN : DAYS_CS)[d(iso).getUTCDay()] : '');
export const monthShort = (iso: string, lang: Lang = 'cs') => (lang === 'en' ? MONTHS_EN[d(iso).getUTCMonth()].slice(0, 3).toUpperCase() : MONTHS_SHORT[d(iso).getUTCMonth()]);
export const dayOfMonth = (iso: string) => d(iso).getUTCDate();
export const monthTitle = (iso: string, lang: Lang = 'cs') => `${(lang === 'en' ? MONTHS_EN : MONTHS_CS_NOM)[d(iso).getUTCMonth()]} ${d(iso).getUTCFullYear()}`;

/** Czech typography: non-breaking space after one-letter prepositions and conjunctions. */
export function nbsp(s = '', lang: Lang = 'cs') {
  if (lang === 'en') return s;
  return s.replace(/(^|[\s(„])([vVaAsSkKzZoOuUiI])\s+/g, '$1$2 ');
}

/** Name of an edition: its own name, else "<competition> <year>". */
export function editionName(ed: any, lang: Lang = 'cs') {
  return t(ed.edition_name, lang) || `${t(ed.competition?.name, lang)} ${ed.year}`;
}

export function editionUrl(ed: any, lang: Lang = 'cs') {
  if (ed.competition?.kind === 'league') return L(`/ligy/${ed.code}/${ed.year}/`, lang);
  return L(`/vysledky/${ed.code}/${ed.year}/`, lang);
}

export function playerLink(slug: string, players: Record<string, any>, lang: Lang = 'cs') {
  const p = players[slug];
  return p?.hasPage ? L(`/hraci/${slug}/`, lang) : null;
}

/** Points: 95.5 -> "95,5" */
export const num = (n: number | null | undefined) => (n == null ? '–' : String(n).replace('.', ','));
