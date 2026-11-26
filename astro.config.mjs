// @ts-check
import { defineConfig } from 'astro/config';

// Until carrom.cz DNS points at GitHub Pages, the site is served from
// https://ondrejchmelar.github.io/carrom.cz/ and needs a base path.
// The deploy workflow sets SITE_URL and BASE_PATH; locally both default to the root.
const site = process.env.SITE_URL || 'https://carrom.cz';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  i18n: {
    defaultLocale: 'cs',
    locales: ['cs', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
