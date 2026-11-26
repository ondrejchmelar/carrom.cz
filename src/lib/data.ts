// Loads every data/**/*.yaml at build time and builds the site model once.
import yaml from 'js-yaml';
import { groupRaw } from './core/raw.js';
import { buildModel } from './core/model.js';

const sources = import.meta.glob('/data/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function parse() {
  const files: Record<string, unknown> = {};
  for (const [path, text] of Object.entries(sources)) {
    files[path.replace(/^\//, '')] = yaml.load(text, { schema: yaml.JSON_SCHEMA }) ?? {};
  }
  return files;
}

let cached: any;
export function model(): any {
  if (!cached) {
    cached = buildModel(groupRaw(parse()));
    for (const w of cached.warnings) console.warn(`[data] ${w}`);
  }
  return cached;
}
