// Context for the "Postup ročníku" panel in the admin editor (public/admin/postup.js):
// what the editor itself cannot see (rankings, uploaded documents, league evenings, links).
import type { APIRoute } from 'astro';
import { model } from '../../lib/data';
import { url, editionUrl } from '../../lib/site';

export const GET: APIRoute = () => {
  const m = model();
  const out: Record<string, any> = {};
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
  }
  return new Response(JSON.stringify({ overview: url('/admin/prehled/'), editions: out }), { headers: { 'Content-Type': 'application/json' } });
};
