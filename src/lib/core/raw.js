// Groups a flat { "relative/path.yaml": parsedObject } map into the raw data shape.
export function groupRaw(files) {
  const raw = { competitions: {}, editions: {}, players: {}, clubs: {}, rankings: {}, documents: {}, leagues: {} };
  for (const [path, value] of Object.entries(files)) {
    const p = path.replace(/^.*?data\//, '').replace(/\.ya?ml$/, '');
    const [dir, ...rest] = p.split('/');
    const key = rest.join('/');
    if (!rest.length) { raw[dir] = value; continue; }
    if (dir === 'leagues') {
      const [season, file] = rest;
      const lg = (raw.leagues[season] ??= { evenings: [], playoff: null });
      if (file === 'playoff') lg.playoff = value;
      else lg.evenings.push({ id: `${season}/${file}`, ...value });
      continue;
    }
    if (raw[dir]) raw[dir][key] = value;
  }
  for (const lg of Object.values(raw.leagues)) lg.evenings.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  return raw;
}
