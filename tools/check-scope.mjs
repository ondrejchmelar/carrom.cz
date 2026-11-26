// Checks that every changed file is something its author may change (data/roles.yaml).
//
// Usage:
//   node tools/check-scope.mjs --push <event.json>          (push to main: checks each commit)
//   node tools/check-scope.mjs --user <login> [--label kód] <file>...   (pull request)
//
// Exit code 1 = something out of scope; the deploy does not run until Ondrej looks at it.
import fs from 'node:fs';
import yaml from 'js-yaml';

const roles = yaml.load(fs.readFileSync(new URL('../data/roles.yaml', import.meta.url), 'utf8')) ?? {};
const BOTS = new Set(['claude[bot]', 'github-actions[bot]', 'claude']);

const CONTENT = [/^content\//, /^data\/(?!roles\.yaml$)/, /^public\/uploads\//];
const CODE = [/^src\//, /^public\/(?!uploads\/)/, /^tools\//, /^package(-lock)?\.json$/, /^astro\.config\.mjs$/, /^tsconfig\.json$/, /^README\.md$/];
const BLOCKED_FOR_NON_ADMIN = [/^\.github\//, /^CLAUDE\.md$/, /^data\/roles\.yaml$/];

export function allowed(user, file, { labels = [] } = {}) {
  const u = String(user ?? '').toLowerCase();
  const lc = (xs) => (xs ?? []).map((x) => String(x).toLowerCase());
  if (lc(roles.admin).includes(u)) return { ok: true };
  if (BLOCKED_FOR_NON_ADMIN.some((r) => r.test(file))) return { ok: false, why: 'jen admin' };
  if (lc(roles.editors).includes(u) || BOTS.has(u)) {
    if (CONTENT.some((r) => r.test(file))) return { ok: true };
    if (BOTS.has(u) && labels.includes('kód') && CODE.some((r) => r.test(file))) return { ok: true, review: true };
    return { ok: false, why: BOTS.has(u) ? 'kód jen se štítkem „kód“ a schválením admina' : 'editor smí jen obsah a data' };
  }
  for (const [league, users] of Object.entries(roles.results ?? {})) {
    if (!lc(users).includes(u)) continue;
    if (new RegExp(`^data/leagues/${league}-\\d{4}/`).test(file) || file.startsWith(`public/uploads/${league}/`)) return { ok: true };
  }
  return { ok: false, why: 'uživatel nemá roli v data/roles.yaml' };
}

function report(rows) {
  let bad = 0;
  for (const { user, file, res } of rows) {
    if (!res.ok) { bad++; console.log(`::error file=${file}::${user} nesmí měnit ${file} (${res.why})`); }
  }
  console.log(bad ? `${bad} souborů mimo oprávnění.` : `Oprávnění v pořádku (${rows.length} souborů).`);
  return bad ? 1 : 0;
}

const args = process.argv.slice(2);
if (args[0] === '--push') {
  const ev = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const rows = [];
  for (const c of ev.commits ?? []) {
    const user = c.author?.username ?? c.committer?.username ?? '';
    for (const file of [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]) rows.push({ user, file, res: allowed(user, file) });
  }
  process.exit(report(rows));
} else if (args[0] === '--user') {
  const user = args[1];
  let rest = args.slice(2);
  const labels = [];
  while (rest[0] === '--label') { labels.push(rest[1]); rest = rest.slice(2); }
  process.exit(report(rest.map((file) => ({ user, file, res: allowed(user, file, { labels }) }))));
} else if (args.length) {
  console.error('Použití: --push <event.json> | --user <login> [--label kód] <soubory…>');
  process.exit(2);
}
