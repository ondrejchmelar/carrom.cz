// Loads data/**/*.yaml from disk and builds the model (for tools and tests).
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { groupRaw } from '../src/lib/core/raw.js';
import { buildModel } from '../src/lib/core/model.js';

export function readFiles(root = path.resolve(import.meta.dirname, '..', 'data')) {
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.ya?ml$/.test(e.name)) {
        const rel = 'data/' + path.relative(root, full).split(path.sep).join('/');
        try { files[rel] = yaml.load(fs.readFileSync(full, 'utf8'), { schema: yaml.JSON_SCHEMA }) ?? {}; }
        catch (err) { throw new Error(`${rel}: ${err.message}`); }
      }
    }
  };
  walk(root);
  return files;
}

export function loadModel(opts) {
  return buildModel(groupRaw(readFiles()), opts);
}
