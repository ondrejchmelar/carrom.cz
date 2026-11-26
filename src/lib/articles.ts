import { getCollection } from 'astro:content';
import type { Lang } from './site';

/** Published articles in one language, newest first. English falls back to Czech. */
export async function articles(lang: Lang = 'cs') {
  const all = await getCollection('articles');
  const cs = all.filter((a) => a.id.endsWith('.cs') || a.id.endsWith('-cs'));
  const list = cs
    .filter((a) => a.data.status === 'published')
    .map((a) => {
      const base = a.id.replace(/[.-]cs$/, '');
      const en = all.find((x) => x.id === `${base}.en` || x.id === `${base}-en`);
      const date = a.data.publish_at ? a.data.publish_at.toISOString().slice(0, 10) : base.split('/').pop()!.slice(0, 10);
      const year = Number(date.slice(0, 4));
      const shown = lang === 'en' && en ? en : a;
      return { id: base, entry: shown, cs: a, en, date, year, slug: a.data.slug, czechOnly: lang === 'en' && !en };
    })
    .sort((x, y) => y.date.localeCompare(x.date));
  return list;
}
