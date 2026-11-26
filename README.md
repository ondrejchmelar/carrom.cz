# carrom.cz

Nový web České carromové asociace. Statický web v [Astro](https://astro.build), data jsou soubory YAML
a Markdown v tomto repozitáři, administrace je [Sveltia CMS](https://github.com/sveltia/sveltia-cms)
na `/admin/`, hosting je GitHub Pages.

## Jak to funguje

```
editor (admin /admin/)  ─┐
asistent (issue → PR)   ─┼─► commit do main ─► GitHub Actions: oprávnění → kontrola dat → testy → build ─► GitHub Pages
importy (SoL, starý web)─┘
```

- **Data** – `data/` (soutěže, ročníky s konečným pořadím, hráči, kluby, MČR, dokumenty, ligy) a `content/` (zprávy a stránky).
- **Počítá web sám** – body MČR od roku 2027, tabulku a playoff ligy PCL, konečné pořadí ligy, kdo má stránku hráče.
- **Kontroly** – `npm run check:data` (odkazy na hráče, ligové zápasy, MČR: rozdíly mezi zveřejněnými body a vzorcem),
  `npm test`, `node tools/check-scope.mjs` (kdo smí co měnit podle `data/roles.yaml`).

## Role

| Role | Kdo | Smí měnit |
| --- | --- | --- |
| admin | Ondrej | všechno |
| editor | `editors` v `data/roles.yaml` | `content/`, `data/`, `public/uploads/` |
| výsledky ligy | `results.<liga>` v `data/roles.yaml` | jen `data/leagues/<liga>-<rok>/` (admin na `/admin/vysledky/`) |
| asistent (Claude) | issue se štítkem `asistent` | jako editor, kód jen se štítkem `kód` |

Všichni potřebují GitHub účet a přístup do repozitáře (Settings → Collaborators). U osobního repozitáře mají
všichni spolupracovníci stejné právo zápisu, proto hranice rolí hlídá workflow **Web**: když někdo změní něco mimo
svou roli, web se nezveřejní a admin dostane e-mail o neúspěšném běhu. Tvrdé omezení už při ukládání by šlo
po převodu repozitáře do (bezplatné) GitHub organizace s pravidly větví.

## Spuštění (jednou)

1. **GitHub Pages** – Settings → Pages → Source: *GitHub Actions*. První nasazení proběhne po sloučení do `main`.
   Web pak běží na `https://ondrejchmelar.github.io/carrom.cz/`.
2. **Admin** – otevřít `/admin/` a kliknout na *Sign in with GitHub* (účet musí být spolupracovníkem repa).
   Záložně jde *Sign in with Token* (Fine-grained token, jen repo `carrom.cz`, Contents: Read and write).
3. **Doména carrom.cz** (až bude web hotový) – Settings → Pages → Custom domain `carrom.cz`.
   U současného poskytovatele DNS změnit jen záznamy webu, pošta zůstává:
   - `carrom.cz` A → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` CNAME → `ondrejchmelar.github.io`
   - záznamy **MX, SPF/TXT a DKIM nechat beze změny** (e-mail běží dál u současného hostingu)
   - v Settings → Secrets and variables → Actions → Variables nastavit `SITE_URL=https://carrom.cz`, `BASE_PATH=/`
   - v `data/settings.yaml` vypnout `preview_banner`
4. **Přihlášení do adminu přes GitHub** – GitHub Pages neumí OAuth, proto běží malá přihlašovací služba
   [Sveltia CMS Authenticator](https://github.com/sveltia/sveltia-cms-auth) na Cloudflare Workers (zdarma):
   `https://carrom-cz.chmelar-o.workers.dev`. Je nastavená jako `base_url` v `public/admin/config.yml`
   a `public/admin/vysledky/config.yml`. GitHub OAuth app má callback `…workers.dev/callback`.
   Kód workeru je ve složce `auth/` (převzato ze sveltia-cms-auth, MIT); Cloudflare ho nasazuje z tohoto repa
   s Root directory `auth`. Client ID a povolené domény jsou v `auth/wrangler.toml`, client secret jen jako
   Secret `GITHUB_CLIENT_SECRET` v Cloudflare, nikdy v repu.
5. **Asistent** – repo secret `ANTHROPIC_API_KEY` (vlastní workspace s limitem $20/měsíc). Bez něj workflow nic nedělá.

## Vývoj

```sh
npm install
npm run dev          # http://localhost:4321
npm run check:data
npm test
npm run build
```
