// Checks the data and prints warnings. Exit code 1 only for errors that would break the site.
import { loadModel } from './load.mjs';

let model;
try {
  model = loadModel();
} catch (err) {
  console.error(`::error::${err.message}`);
  process.exit(1);
}
for (const w of model.warnings) console.log(`::warning::${w}`);
for (const r of Object.values(model.rankings)) {
  for (const c of r.check) {
    if (c.status === 'not-checked') console.log(`MČR ${r.year} · ${c.edition}: nezkontrolováno (${c.note})`);
    if (c.status === 'ok') console.log(`MČR ${r.year} · ${c.edition}: OK (${c.count} hráčů)`);
    if (c.status === 'differs') {
      console.log(`MČR ${r.year} · ${c.edition}: zveřejněné body neodpovídají vzorci`);
      for (const d of c.diffs) console.log(`  ${d.player.padEnd(24)} zveřejněno ${d.published ?? '–'}  vzorec ${d.formula}`);
    }
  }
}
for (const [id, s] of Object.entries(model.seasons)) {
  console.log(`${id}: ${s.table.length} hráčů v tabulce, ${s.matches.length} zápasů, fáze ${s.phase}${s.complete ? ', playoff dohráno' : ''}`);
}
console.log(`Hotovo: ${model.warnings.length} upozornění.`);
