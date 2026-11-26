// @ts-check
import { defineConfig } from 'astro/config';

// Until carrom.cz DNS points at GitHub Pages, the site is served from
// https://ondrejchmelar.github.io/carrom.cz/ and needs a base path.
// The deploy workflow sets SITE_URL and BASE_PATH; locally both default to the root.
const site = process.env.SITE_URL || 'https://carrom.cz';
const base = process.env.BASE_PATH || '/';

// Markdown (news, pages) links like /uploads/x.pdf or /vysledky/ get the base path too.
function rehypeBase() {
  const prefix = base.replace(/\/$/, '');
  const walk = (node) => {
    if (node.type === 'element' && node.properties) {
      for (const k of ['href', 'src']) {
        const v = node.properties[k];
        if (prefix && typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith(prefix + '/')) node.properties[k] = prefix + v;
      }
    }
    for (const c of node.children ?? []) walk(c);
  };
  return (tree) => walk(tree);
}

export default defineConfig({
  site,
  base,
  markdown: { rehypePlugins: [rehypeBase] },
  trailingSlash: 'always',
  build: { format: 'directory' },
  i18n: {
    defaultLocale: 'cs',
    locales: ['cs', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
