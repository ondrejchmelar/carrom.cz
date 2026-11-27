// Context for the "Postup ročníku" panel in the admin editor (public/admin/postup.js):
// what the editor itself cannot see (rankings, uploaded documents, league evenings, links).
// `used` feeds the save check in public/admin/kontrola.js: values that belong to one edition only.
import type { APIRoute } from 'astro';
import { model } from '../../lib/data';
import { url, editionUrl } from '../../lib/site';

// Same key as resultsKey() in public/admin/kontrola.js: division + every row, hashed (djb2).
function resultsKey(div: string, rows: any[]) {
  const text = div + '=' + rows.map((r) => `${r.place}:${r.player ?? r.name ?? ''}`).join('|');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const GET: APIRoute = () => {
  const m = model();
  const out: Record<string, any> = {};
  const used: Record<string, Record<string, any>> = { signup: {}, sol: {}, video: {}, results: {} };
  for (const ed of Object.values(m.editions as Record<string, any>)) {
    const ranking: any = Object.values(m.rankings as Record<string, any>).find((r: any) => (r.editions ?? []).includes(ed.id));
    out[ed.id] = {
      ranking: ranking ? ranking.name?.cs ?? ranking.id : null,
      uploadedPropozice: m.documents.some((d: any) => d.edition === ed.id && d.kind === 'propozice'),
      evenings: (m.seasons as any)[ed.id]?.evenings?.length ?? 0,
      playoffDone: !!(m.seasons as any)[ed.id]?.complete,
      page: editionUrl(ed),
      pdf: ed.propoziceAuto ? url(`/propozice/${ed.code}-${ed.year}.pdf`) : null,
    };
    const signup = ed.signup_url ?? ed.links?.signup_url;
    if (signup) used.signup[signup] = [...(used.signup[signup] ?? []), ed.id];
    if (ed.sol_lit_url) used.sol[ed.sol_lit_url] = [...(used.sol[ed.sol_lit_url] ?? []), ed.id];
    if (ed.final_video) used.video[ed.final_video] = [...(used.video[ed.final_video] ?? []), ed.id];
    if (!ed.resultsComputed) {
      for (const [div, rows] of Object.entries(ed.results ?? {}) as [string, any[]][]) {
        if ((rows ?? []).length) used.results[resultsKey(div, rows)] = ed.id;
      }
    }
  }
  // PCL playoff preview (public/admin/playoff.js): seeds (provisional from the table during the group stage),
  // format and names, so the admin can draw the bracket while scores are typed.
  const playoff: Record<string, any> = {};
  for (const ed of Object.values(m.editions as Record<string, any>)) {
    const s = (m.seasons as any)[ed.id];
    if (ed.code !== 'pcl' || !s) continue;
    const seeds: string[] = s.seeds?.length ? s.seeds : s.table.map((r: any) => r.player);
    const names = Object.fromEntries(seeds.map((p) => {
      const pl: any = (m.players as any)[p] ?? {};
      return [p, pl.short_name || [pl.first_name, pl.last_name].filter(Boolean).join(' ') || p];
    }));
    playoff[`pcl-${ed.year}`] = { seeds, provisional: !s.seeds?.length, names, groups: ed.format?.playoff?.groups ?? ['1-8'], best_of: ed.format?.playoff?.best_of ?? {} };
  }
  return new Response(JSON.stringify({ overview: url('/admin/prehled/'), editions: out, used, playoff }), { headers: { 'Content-Type': 'application/json' } });
};
