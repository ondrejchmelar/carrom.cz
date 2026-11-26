// Player names and the list of each player's results.

export function fullName(p, slug = '') {
  if (!p) return slug;
  const nick = p.nickname ? ` „${p.nickname}“` : '';
  return `${p.first_name}${nick} ${p.last_name}`.trim();
}

export function plainName(p, slug = '') {
  return p ? `${p.first_name} ${p.last_name}`.trim() : slug;
}

/** Short name for dense league tables: short_name, else first name (+ initial when two share it). */
export function shortNames(slugs, players) {
  const firsts = new Map();
  for (const s of slugs) {
    const f = players[s]?.first_name ?? s;
    firsts.set(f, (firsts.get(f) ?? 0) + 1);
  }
  return Object.fromEntries(
    slugs.map((s) => {
      const p = players[s];
      if (!p) return [s, s];
      if (p.short_name) return [s, p.short_name];
      return [s, firsts.get(p.first_name) > 1 ? `${p.first_name} ${p.last_name[0]}.` : p.first_name];
    }),
  );
}
