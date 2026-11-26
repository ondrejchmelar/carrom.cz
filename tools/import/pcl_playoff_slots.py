"""Whole PCL playoff brackets 2017–2025 from the old hand-made playoff pages, written per slot.

The old pages list each match as nameA, nameB and a score in the order of those names. That order is not
always the bracket order (top/bottom), so every score is matched to its slot by the pair of players and
turned to "top:bottom" here. This is what went wrong when PCL 2026 was typed by hand.

Writes data/leagues/pcl-<year>/playoff.yaml and prints the playoff format for each edition.
Usage: python3 -I tools/import/pcl_playoff_slots.py <cache-dir>
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# slot id, feeds (as in src/lib/core/pcl.js PCL8), lower bracket
PCL8 = [
    ('qf1', [('seed', 1), ('seed', 8)], False), ('qf2', [('seed', 5), ('seed', 4)], False),
    ('qf3', [('seed', 3), ('seed', 6)], False), ('qf4', [('seed', 7), ('seed', 2)], False),
    ('sf1', [('w', 'qf1'), ('w', 'qf2')], False), ('sf2', [('w', 'qf3'), ('w', 'qf4')], False),
    ('l-sf1', [('l', 'qf1'), ('l', 'qf2')], True), ('l-sf2', [('l', 'qf3'), ('l', 'qf4')], True),
    ('f1', [('w', 'sf1'), ('w', 'sf2')], False), ('f3', [('l', 'sf1'), ('l', 'sf2')], False),
    ('f5', [('w', 'l-sf1'), ('w', 'l-sf2')], True), ('f7', [('l', 'l-sf1'), ('l', 'l-sf2')], True),
]
PLACES = {'f1': 1, 'f3': 3, 'f5': 5, 'f7': 7}
GAME = re.compile(r'(\d+|O)\s*:\s*(\d+|O)')

def games(sc):
    out = [f"{0 if a == 'O' else int(a)}:{0 if b == 'O' else int(b)}" for a, b in GAME.findall(sc)]
    return [g for g in out if g != '0:0']  # "0:0" = placeholder for a game not played

def norm(n):
    return re.sub(r'[.:\s]+', ' ', n).strip().lower()

def clean(n):
    return re.sub(r'<[^>]+>', '', n).strip().rstrip(':.').strip()

def page_matches(s):
    """[(placeA, placeB, nameA, nameB, [games])] in page order."""
    if 'setMatch(' in s:
        rx = r"^\s*setMatch\((?:'[AB]',\s*)?(\d+),\s*\d+,\s*(\d+),\s*(\d+),\s*'([^']*)',\s*'([^']*)',\s*\"([^\"]*)\""
        return [(int(a), int(b), clean(x), clean(y), games(sc)) for n, a, b, x, y, sc in re.findall(rx, s, re.M) if x]
    t = re.sub(r'(?is)<(script|style).*?</\1>', '', s)
    t = re.sub(r'(?i)<br\s*/?>', '\n', t)
    t = re.sub(r'(?i)</(td|th|tr|div|p)>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    toks = [x.strip() for x in t.split('\n') if x.strip() and x.strip() != '\xa0']
    toks = [x for x in toks if not re.match(r'(Čtvrtfinále|Semifinále|Finále|Skupina|Playoff|Pavouk)', x)]
    out, i = [], 0
    while i < len(toks):
        if re.fullmatch(r'\d+', toks[i]) and i + 2 < len(toks) and re.fullmatch(r'\d+', toks[i + 1]) and not re.fullmatch(r'[\d:O ]+', toks[i + 2]):
            sa, na = int(toks[i + 1]), toks[i + 2]
            j, sc = i + 3, []
            while j < len(toks) and GAME.fullmatch(toks[j]):
                sc.append(toks[j]); j += 1
            if j + 1 < len(toks) and re.fullmatch(r'\d+', toks[j]):
                out.append((sa, int(toks[j]), clean(na), clean(toks[j + 1]), games(' '.join(sc))))
                i = j + 2
                continue
        i += 1
    return out

def page_dates(s, year):
    t = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    out = {}
    for k, w in (('qf', 'Čtvrtfinále'), ('sf', 'Semifinále'), ('f', 'Finále')):
        m = re.search(w + r'\s*(\d{1,2})\.\s*(\d{1,2})\.', t)
        if m:
            out[k] = f'{year}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
    return out

def tally(gs):
    a = b = 0
    for g in gs:
        x, y = map(int, g.split(':'))
        a += x > y; b += y > x
    return a, b

def stored_places(year):
    path = os.path.join(ROOT, 'data/editions/pcl', f'{year}.yaml')
    return {int(p): pid for p, pid in re.findall(r'\{\s*place:\s*(\d+),\s*player:\s*([a-z0-9-]+)\s*\}', open(path).read())}

def main(cache):
    finals = json.loads(os.popen(f'{sys.executable} -I {os.path.join(os.path.dirname(__file__), "pcl_playoff.py")} {cache}').read())
    report = {}
    for year in range(2017, 2026):
        y = str(year)
        stored = stored_places(year)
        pages = {}
        for f in sorted(os.listdir(cache)):
            m = re.match(rf'pcl__playoff{y}__(.*)\.html$', f)
            if not m:
                continue
            s = open(os.path.join(cache, f), 'rb').read().decode('utf-8', 'replace')
            if "setMatch('" in s:  # 2024+: both groups on one page
                for g in 'AB':
                    part = '\n'.join(l for l in s.split('\n') if f"setMatch('{g}'" in l)
                    if part:
                        pages[g] = (part, s)
            else:
                pages['B' if m.group(1).upper().endswith('B') else 'A'] = (s, s)
        dates, seeds, out_games, best_of, notes, winners = {}, [], {}, {}, [], {}
        for g in sorted(pages):
          try:
            body, whole = pages[g]
            dates = dates or page_dates(whole, year)
            ms = page_matches(body)
            off = 0 if g == 'A' else 8
            key = f'{off + 1}-{off + 8}'
            # names -> player ids, from the final places worked out from the same page
            name_id = {}
            for place, name in finals[y][g]:
                if place in stored:
                    name_id[clean(name)] = stored[place]
            def pid(n):
                for k, v in name_id.items():
                    if norm(k) == norm(n):
                        return v
                for k, v in name_id.items():  # spelling variants: Ondra/Ondřej, Honza/Jan, Franta Č:/Franta Č.
                    if ALIASES.get(n) == k or ALIASES.get(k) == n:
                        return v
                raise Skip(f'{y} {g}: neznámé jméno {n!r} (známá: {sorted(name_id)})')
            seed = {}
            for pa, pb, na, nb, _ in ms[:4]:
                seed[pa - off], seed[pb - off] = pid(na), pid(nb)
            if sorted(seed) != list(range(1, 9)):
                raise Skip(f'{y} {g}: čtvrtfinále nedávají nasazení 1–8: {seed}')
            gseeds = [seed[i] for i in range(1, 9)]
            pairs = {frozenset((pid(na), pid(nb))): (pid(na), gs) for _, _, na, nb, gs in ms}
            # best of: 3 when any game in that part of the bracket had a second game
            main = 3 if any(len(gs) > 1 for _, _, _, _, gs in ms[:6] + ms[8:10]) else 1
            lower = 3 if any(len(gs) > 1 for _, _, _, _, gs in ms[6:8] + ms[10:12]) else 1
            best_of[key] = main
            if lower != main:
                best_of[f'{key}/5-8'] = lower
            res, gout = {}, {}
            for sid, feeds, low in PCL8:
                pl = []
                for kind, ref in feeds:
                    if kind == 'seed':
                        pl.append(seed[ref])
                    else:
                        top, bot, w = res[ref]
                        pl.append((top, bot)[w if kind == 'w' else 1 - w])
                hit = pairs.get(frozenset(pl))
                if not hit:
                    raise Skip(f'{y} {g} {sid}: zápas {pl} na stránce není')
                first, gs = hit
                if first != pl[0]:
                    gs = [':'.join(reversed(x.split(':'))) for x in gs]
                bo = lower if low else main
                a, b = tally(gs)
                need = bo // 2 + 1
                if max(a, b) < need:  # e.g. a single game in a best-of-3 slot, a draw, or a walkover
                    n = len(gs)
                    if n % 2 and max(a, b) >= n // 2 + 1:
                        best_of[f'{key}/{sid}'] = n
                        notes.append(f'{key} {sid}: jen {n} hra/y, bere se jako na {n}')
                    else:
                        if a != b:
                            w, why = (0 if a > b else 1), f'nerozhodná série {gs}'
                        elif gs:  # a draw in a deciding game: the old page names the winner first
                            w, why = (0 if first == pl[0] else 1), f'remíza {gs}'
                        else:  # no score ("x:X", walkover): the winner is who plays on, or the stored place
                            why = 'bez skóre (kontumace)'
                            nxt = next((i for i, (_, fd, _) in enumerate(PCL8) if ('w', sid) in fd), None)
                            if nxt is not None:
                                _, _, na, nb, _ = ms[nxt]
                                w = 0 if pl[0] in (pid(na), pid(nb)) else 1
                            else:
                                w = 0 if stored.get(PLACES[sid] + off) == pl[0] else 1
                        winners.setdefault(key, {})[sid] = w
                        notes.append(f'{key} {sid}: {why}, vítěz podle starého webu {pl[w]}')
                        a, b = (1, 0) if w == 0 else (0, 1)
                res[sid] = (pl[0], pl[1], 0 if a > b else 1)
                gout[sid] = gs
                if sid in PLACES:
                    p = PLACES[sid] + off
                    w = pl[0] if a > b else pl[1]
                    l = pl[1] if a > b else pl[0]
                    for place, who in ((p, w), (p + 1, l)):
                        if stored.get(place) != who:
                            notes.append(f'!! {place}. místo: pavouk {who}, uloženo {stored.get(place)}')
            out_games[key] = gout
            seeds += gseeds
          except Skip as e:  # irregular group (e.g. 2021 B with 5 players): keep only its final places
            notes.append(f'!! skupina {g} vynechána: {e}')
            if g == 'A':
                break
        if out_games:
            write(year, seeds, out_games, winners)
        report[y] = {'groups': list(out_games), 'best_of': best_of, 'dates': dates, 'notes': notes}
    json.dump(report, sys.stdout, ensure_ascii=False, indent=1)

class Skip(Exception):
    pass

ALIASES = {'Ondra': 'Ondřej', 'Honza': 'Jan', 'Franta Č:': 'Franta Č.', 'Zdenda': 'Zdeněk', 'Šefik': 'Šéfik'}

def write(year, seeds, games, winners):
    d = os.path.join(ROOT, 'data/leagues', f'pcl-{year}')
    os.makedirs(d, exist_ok=True)
    lines = [
        f'# Playoff PCL {year} převzaté ze starého webu (tools/import/pcl_playoff_slots.py).',
        '# Tabulka základního kola na webu není, proto je nasazení vypsané. Skóre je "horní:dolní" podle slotu.',
        'seeds:',
        *[f'  - {s}' for s in seeds],
        'games:',
    ]
    for key, gs in games.items():
        lines.append(f'  "{key}":')
        for sid, lst in gs.items():
            lines.append(f'    {sid}: [{", ".join(json.dumps(x) for x in lst)}]')
    if winners:
        lines.append('winners:                    # série, kterou skóre nerozhodne (remíza, kontumace bez skóre): vítěz podle starého webu, 0 horní, 1 dolní')
        for key, w in winners.items():
            lines.append(f'  "{key}": {{ {", ".join(f"{k}: {v}" for k, v in w.items())} }}')
    open(os.path.join(d, 'playoff.yaml'), 'w').write('\n'.join(lines) + '\n')

if __name__ == '__main__':
    main(sys.argv[1])
