"""Final places of PCL seasons 2017–2026 from the old hand-made playoff pages (two formats).

Prints JSON {year: {group: [(place, name), ...]}} with first names as written on the old pages.
Usage: python3 -I tools/import/pcl_playoff.py <cache-dir>
"""
import html, json, os, re, sys

def sets_winner(score):
    a = b = 0
    for m in re.finditer(r'(\d+|O)\s*:\s*(\d+|O)', score):
        x, y = (0 if v == 'O' else int(v) for v in m.groups())
        a += x > y; b += y > x
    return 0 if a >= b else 1

def from_js(s, group='A'):
    """setMatch(['A',] n, base, seedA, seedB, 'nameA', 'nameB', "scores", ...); group letter only from 2024."""
    out = {}
    for g, n, sa, sb, na, nb, sc in re.findall(r"^\s*setMatch\((?:'([AB])',\s*)?(\d+),\s*\d+,\s*(\d+),\s*(\d+),\s*'([^']*)',\s*'([^']*)',\s*\"([^\"]*)\"", s, re.M):
        if int(n) < 9 or not na:
            continue
        g = g or group
        lo = min(int(sa), int(sb))
        w = sets_winner(sc)
        win, lose = (na, nb) if w == 0 else (nb, na)
        out.setdefault(g, []).extend([(lo, win), (lo + 1, lose)])
    return out

def from_html(s, group):
    """2017–2023: static tables; the last 4 matches are the finals for 1st, 3rd, 5th and 7th place."""
    t = re.sub(r'(?is)<(script|style).*?</\1>', '', s)
    t = re.sub(r'(?i)<br\s*/?>', '\n', t)
    t = re.sub(r'(?i)</(td|th|tr|div|p)>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    toks = [x.strip() for x in t.split('\n') if x.strip() and x.strip() != '\xa0']
    toks = [x for x in toks if not re.match(r'(Čtvrtfinále|Semifinále|Finále|Skupina|Playoff|Pavouk)', x)]
    # match = seed-of-slot, seedA, nameA, scores..., seedB, nameB
    matches, i = [], 0
    while i < len(toks):
        if re.fullmatch(r'\d+', toks[i]) and i + 2 < len(toks) and re.fullmatch(r'\d+', toks[i + 1]) and not re.fullmatch(r'[\d:O ]+', toks[i + 2]):
            sa, na = int(toks[i + 1]), toks[i + 2]
            j, sc = i + 3, []
            while j < len(toks) and re.fullmatch(r'(\d+|O)\s*:\s*(\d+|O)', toks[j]):
                sc.append(toks[j]); j += 1
            if j + 1 < len(toks) and re.fullmatch(r'\d+', toks[j]):
                sb, nb = int(toks[j]), toks[j + 1]
                matches.append((sa, na, sb, nb, ' '.join(sc)))
                i = j + 2
                continue
        i += 1
    finals = matches[-4:]
    out = []
    off = 0 if group == 'A' else 8
    for sa, na, sb, nb, sc in finals:
        lo = min(sa, sb)
        lo = lo if lo > 8 or group == 'A' else lo + off
        w = sets_winner(sc) if sc else 0
        win, lose = (na, nb) if w == 0 else (nb, na)
        out += [(lo, win), (lo + 1, lose)]
    return out

if __name__ == '__main__':
    d = sys.argv[1]
    res = {}
    for f in sorted(os.listdir(d)):
        m = re.match(r'pcl__playoff(\d{4})__(.*)\.html$', f)
        if not m:
            continue
        y, page = m.groups()
        s = open(os.path.join(d, f), 'rb').read().decode('utf-8', 'replace')
        if 'setMatch(' in s:
            g = 'B' if page.upper().endswith('B') else 'A'
            res.setdefault(y, {}).update(from_js(s, g))
        else:
            g = 'B' if page.upper().endswith('B') else 'A'
            res.setdefault(y, {})[g] = from_html(s, g)
    for y in res:
        for g in res[y]:
            res[y][g].sort()
    json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
