// getStaticPaths helpers shared by the Czech routes and their English twins under /en/.
import { model } from './data';
import { articles } from './articles';

const today = () => new Date().toISOString().slice(0, 10);

export function resultYears() {
  const m = model();
  return [...new Set(m.editionList.filter((e: any) => (e.start_date ?? '') <= today()).map((e: any) => e.year))].sort((a: any, b: any) => b - a) as number[];
}
export function resultYearPaths() {
  const years = resultYears();
  return years.slice(1).map((y) => ({ params: { year: String(y) }, props: { year: y, years } }));
}
export function tournamentPaths() {
  return Object.entries(model().competitions).filter(([, c]: any) => c.kind !== 'league').map(([code]) => ({ params: { code }, props: { code } }));
}
export function leaguePaths() {
  return Object.entries(model().competitions).filter(([, c]: any) => c.kind === 'league').map(([code]) => ({ params: { code }, props: { code } }));
}
export function tournamentEditionPaths() {
  return Object.values(model().editions).filter((e: any) => e.competition.kind !== 'league').map((e: any) => ({ params: { code: e.code, year: String(e.year) }, props: { id: e.id } }));
}
export function leagueSeasonPaths() {
  return Object.values(model().editions).filter((e: any) => e.competition.kind === 'league').map((e: any) => ({ params: { code: e.code, year: String(e.year) }, props: { id: e.id } }));
}
export function rankingPaths() {
  return Object.values(model().rankings).map((r: any) => ({ params: { year: String(r.year) }, props: { id: r.id } }));
}
export function playerPaths() {
  return Object.values(model().players).filter((p: any) => p.hasPage).map((p: any) => ({ params: { slug: p.slug }, props: { slug: p.slug } }));
}
export async function newsYearPaths() {
  const list = await articles('cs');
  return [...new Set(list.map((a) => a.year))].map((year) => ({ params: { year: String(year) }, props: { year } }));
}
export async function articlePaths() {
  const list = await articles('cs');
  return list.map((a) => ({ params: { year: String(a.year), slug: a.slug }, props: { id: a.id } }));
}
