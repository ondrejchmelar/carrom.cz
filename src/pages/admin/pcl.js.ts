// The PCL bracket logic for the admin preview (public/admin/playoff.js), served as-is so the preview
// computes the same bracket as the site build. src/lib/core/pcl.js has no imports, so it runs in the browser.
import type { APIRoute } from 'astro';
import source from '../../lib/core/pcl.js?raw';

export const GET: APIRoute = () => new Response(source, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
