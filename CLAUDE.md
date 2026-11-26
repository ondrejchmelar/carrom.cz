# carrom.cz – instructions for Claude (admin assistant and developers)

Web of the Czech Carrom Association. Astro static site, data in this repo, Sveltia CMS admin, hosted on GitHub Pages.
Czech is the main language. Write Czech copy with Czech typography (non-breaking space after one-letter
prepositions v, a, s, k, z, o, u, i). Keep the word "striker" untranslated.

## Where things are
- `data/**/*.yaml` – the database: competitions, editions (one year of a competition, with final places),
  players, clubs, rankings (MČR), documents, leagues (PCL evenings + playoff), settings, navigation, home, roles.
- `content/articles/<year>/<date>-<slug>.<cs|en>.md` – news. `content/pages/<slug>.<cs|en>.md` – fixed pages.
- `public/uploads/` – photos and PDFs. `src/` – Astro code. `tools/` – checks and importers.
- Menus are in `data/navigation.yaml`, never hard-coded.

## Rules for the admin assistant
- You may change `content/**`, `data/**` (except `data/roles.yaml`) and `public/uploads/**`.
- `src/**` and other code only when the issue has the label `kód`; Ondrej must approve.
- Never change `.github/**`, `CLAUDE.md` or `data/roles.yaml`. CI enforces this (tools/check-scope.mjs).
- Never add personal contact data (phones, private e-mails). Only association addresses like pcl@carrom.cz.
- Final places of leagues with a playoff are computed by the build: do not type them into `results`.
- MČR points for years from 2027 are computed; do not type them. Years up to 2026 keep the published points.
- Player ids are file names in `data/players/`. Reuse an existing player (check `spellings`) before adding one.
- Before opening the PR run `npm run check:data`, `npm test` and `npm run build`; fix every new warning.
- Open one PR per request, describe the change in Czech in one or two sentences.
