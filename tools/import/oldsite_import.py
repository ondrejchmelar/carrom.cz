"""One-off import of final results from the old carrom.cz into data/**/*.yaml.

Input:  pages.json from oldsite_parse.py, the player merge decisions (player_spellings.csv).
Output: data/editions/<code>/<year>.yaml, data/rankings/mcr-<year>.yaml, data/players/<id>.yaml,
        data/redirects.yaml. Existing files with results are never overwritten; an existing
        edition with empty results gets the imported results added.

Usage: python3 -I tools/import/oldsite_import.py pages.json player_spellings.csv [--dry]
"""
import csv, json, os, re, sys, unicodedata
from collections import defaultdict

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'data')
DRY = '--dry' in sys.argv
CZECH_COMPS = {'pcl', 'cml', 'cocp', 'druhy', 'jarni', 'tcc', 'mcr', 'mcrj'}

# ------------------------------------------------------------------ helpers

def ascii_(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()

def key(name):
    """Order- and accent-insensitive key, so 'Sochor Martin' == 'Martin Sochor'."""
    n = ascii_(name).lower().replace('"', ' ').replace('„', ' ').replace('“', ' ').replace('.', ' ')
    return ' '.join(sorted(n.split()))

def flip(name):
    """'Sochor Martin' -> 'Martin Sochor'; quoted nicknames stay in the middle."""
    t = name.split()
    return ' '.join(t[1:] + t[:1]) if len(t) > 1 else name

def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', ascii_(s).lower()).strip('-')

def load_yaml(path):
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f) or {}

def q(v):
    """YAML scalar."""
    if v is None:
        return '~'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    if s == '' or re.search(r'[:#\[\]{},&*!|>\'"%@`]|^[-?\s]|\s$', s) or s.lower() in ('yes', 'no', 'true', 'false', 'null', '~') or re.fullmatch(r'[\d.\-+e ]+', s):
        return json.dumps(s, ensure_ascii=False)
    return s

def flow(d):
    return '{ ' + ', '.join(f'{k}: {q(v)}' for k, v in d.items() if v is not None) + ' }'

def block(text, indent):
    pad = ' ' * indent
    return '|\n' + '\n'.join(pad + l for l in text.strip().split('\n'))

written = []

def write(rel, content):
    path = os.path.join(DATA, rel)
    written.append(rel)
    if DRY:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# ------------------------------------------------------------------ players

class Players:
    def __init__(self, csv_path):
        self.by_key = {}        # name key -> canonical display name
        self.nick = {}          # canonical -> nickname
        self.ids = {}           # canonical key -> player id
        self.existing = {}      # id -> data
        self.spell = defaultdict(set)   # id -> spellings seen
        self.new = {}           # id -> {first,last,nickname,country}
        self.mcr = set()
        self.reviewed = set()   # canonical names a person reviewed (written first name first)
        self.countries = defaultdict(list)
        self._load_existing()
        self._load_csv(csv_path)

    def _load_existing(self):
        d = os.path.join(DATA, 'players')
        for f in os.listdir(d):
            pid = f[:-5]
            p = load_yaml(os.path.join(d, f))
            self.existing[pid] = p
            names = [f"{p.get('first_name', '')} {p.get('last_name', '')}"]
            if p.get('nickname'):
                names.append(f"{p['first_name']} {p['nickname']} {p['last_name']}")
            names += p.get('spellings') or []
            for n in names:
                self.ids.setdefault(key(n), pid)

    def _load_csv(self, path):
        manual = {  # decisions written in words in the CSV
            'Franta II. Červenka': 'František Červenka', 'Shiw Sah': 'Shiv Sah', 'Jan Muller': 'Jakub Müller',
            'Michal': 'Michal Fučík', 'Karlík Novák': 'Karlos Novák', 'Martin Černý Garamvála': 'Martin Černý',
            'Monika Blažkovičová': 'Monika Blaškovičová', 'Roshin Christian': 'Rosin Kristian',
        }
        for r in csv.DictReader(open(path, encoding='utf-8')):
            spellings = [re.sub(r'\s*\([^)]*\)\s*$', '', s).strip() for s in r['spellings found (competition, years)'].split(' | ')]
            if r['section'] == 'merged automatically' and len(spellings) > 1:
                # pick the best written form: accents kept, name first as in the Czech tournament tables
                comps = r['spellings found (competition, years)'].split(' | ')
                def score(i):
                    sp, c = spellings[i], comps[i]
                    return (sum(ch != ascii_(ch) for ch in sp) * 2
                            + bool(re.search(r'\b(PCL|COCP|JARNI|DRUHY|CML|TCC)\b', c))
                            + (not sp.split()[0].lower().endswith('ová')))
                r = dict(r, **{'suggested name': spellings[max(range(len(spellings)), key=score)]})
            decision = (r['your decision'] or '').lower()
            sugg = r['suggested name'].strip()
            nick = None
            m = re.match(r'(.*?),\s*nickname\s+(.*)', sugg)
            if m:
                sugg, nick = m.group(1).strip(), m.group(2).strip()
            separate = 'keep separate' in decision or 'keep as written' in decision or 'imported as written' in decision
            for s in spellings:
                if s in manual:
                    canon = manual[s]
                elif separate or not sugg:
                    canon = s
                else:
                    canon = sugg
                self.by_key.setdefault(key(s), canon)
            if nick and sugg:
                self.nick[sugg] = nick
            if sugg and r['section'] != 'merged automatically':
                self.reviewed.add(sugg)
        self.nick.setdefault('Martin Černý', 'Garamvála')

    def first_names(self, pages):
        """First names seen in name-first tables, to detect tables written 'Surname First'."""
        F = set()
        for p in self.existing.values():
            F.add(ascii_(str(p.get('first_name', ''))).lower())
        for canon in self.reviewed:
            if len(canon.split()) > 1:
                F.add(ascii_(canon.split()[0]).lower())
        F |= set('''hans georg steffen ingo andreas marvin frank claudio francesco bernhard armin fabio peter paolo
            thomas thorsten tobias dirk gunter gunnar bodo sascha suzanne antje stefan stefano michael markus martin
            wolfgang ralf jens jorg joerg uwe klaus heiko sebastian simone simon carlos carlo luca marco giuseppe
            pierre jean cedric karim rodrigo fabian jelle pim lorenzo mervin abdul mohammed ali'''.split())
        self.F = {f for f in F if f}

    def surname_first(self, names):
        sc = 0
        for n in names:
            t = ascii_(n.replace('"', ' ')).lower().split()
            if len(t) < 2:
                continue
            sc += (t[0] in self.F) - (t[-1] in self.F)
            sc += (t[-1].endswith('ova')) - (t[0].endswith('ova'))
        return sc < 0

    def canonical(self, raw):
        raw = ' '.join(raw.replace('*', '').split())
        return self.by_key.get(key(raw), raw)

    def resolve(self, raw, country=None, create=True, mcr=False):
        """Player id for a name; creates a new player when create=True. Returns (id or None, canonical name)."""
        raw = ' '.join(raw.replace('*', '').split())
        canon = self.canonical(raw)
        pid = self.ids.get(key(canon)) or self.ids.get(key(raw))
        if not pid and create:
            t = ascii_(canon.replace('"', ' ')).lower().split()
            if len(t) > 1 and ((t[0] not in self.F and t[-1] in self.F) or (t[0].endswith('ova') and not t[-1].endswith('ova'))):
                canon = flip(canon)
            parts = canon.split()
            first, last = (' '.join(parts[:-1]), parts[-1]) if len(parts) > 1 else (parts[0], '')
            pid = slugify(f'{first} {last}') or slugify(canon)
            base, n = pid, 2
            while pid in self.existing or (pid in self.new and key(self.new[pid]['name']) != key(canon)):
                pid = f'{base}-{n}'; n += 1
            self.new.setdefault(pid, {'name': canon, 'first_name': first, 'last_name': last, 'nickname': self.nick.get(canon)})
            self.ids[key(canon)] = pid
            self.F.add(ascii_(first.split()[0]).lower() if first else '')
        if pid:
            if raw != canon and key(raw) != key(canon) or raw != canon:
                self.spell[pid].add(raw)
            if country:
                self.countries[pid].append(country)
            if mcr:
                self.mcr.add(pid)
        return pid, canon

    def save(self):
        for pid, p in sorted(self.new.items()):
            c = [x for x in self.countries.get(pid, []) if x]
            country = max(set(c), key=c.count) if c else 'CZ'
            lines = [f"first_name: {q(p['first_name'])}", f"last_name: {q(p['last_name'])}"]
            if p.get('nickname'):
                lines.append(f"nickname: {q(p['nickname'])}")
            lines.append(f'country: {country}')
            if pid in self.mcr:
                lines.append('mcr: true')
            full = {f"{p['first_name']} {p['last_name']}", f"{p['first_name']} {p.get('nickname') or ''} {p['last_name']}"}
            sp = sorted(s for s in self.spell.get(pid, ()) if ' '.join(s.split()) not in {' '.join(x.split()) for x in full})
            if sp:
                lines.append('spellings:')
                lines += [f'  - {q(s)}' for s in sp]
            lines.append('source: old-site')
            write(f'players/{pid}.yaml', '\n'.join(lines) + '\n')
        # new spellings on existing players
        for pid, sp in self.spell.items():
            if pid not in self.existing:
                continue
            p = self.existing[pid]
            have = set(p.get('spellings') or []) | {f"{p.get('first_name')} {p.get('last_name')}"}
            if p.get('nickname'):
                have.add(f"{p['first_name']} {p['nickname']} {p['last_name']}")
            add = sorted(s for s in sp if s not in have)
            if not add:
                continue
            path = os.path.join(DATA, 'players', f'{pid}.yaml')
            text = open(path, encoding='utf-8').read().rstrip('\n')
            if 'spellings:' not in text:
                text += '\nspellings:'
            text += ''.join(f'\n  - {q(s)}' for s in add)
            written.append(f'players/{pid}.yaml (+spellings)')
            if not DRY:
                open(path, 'w', encoding='utf-8').write(text + '\n')
            if pid in self.mcr and not p.get('mcr') and not DRY:
                pass


# ------------------------------------------------------------------ pages

MONTHS = {'ledna': 1, 'února': 2, 'března': 3, 'dubna': 4, 'května': 5, 'června': 6, 'července': 7, 'srpna': 8, 'září': 9, 'října': 10, 'listopadu': 11, 'prosince': 12}

def find_dates(text, year):
    """First date range in the text for that year: returns (start, end) as ISO strings or (None, None)."""
    m = re.search(r'(\d{1,2})\.\s*(?:-\s*(\d{1,2})\.\s*)?(\d{1,2})\.\s*(\d{4})?', text)
    best = None
    for m in re.finditer(r'(\d{1,2})\.\s*(?:[-–]\s*(\d{1,2})\.\s*)?(\d{1,2})\.\s*(\d{4})?', text):
        d1, d2, mo, y = m.groups()
        if y and int(y) != year:
            continue
        if not (1 <= int(mo) <= 12 and 1 <= int(d1) <= 31):
            continue
        best = (int(d1), int(d2) if d2 else None, int(mo))
        break
    if not best:
        for m in re.finditer(r'(\d{1,2})\.\s*(?:[-–]\s*(\d{1,2})\.\s*)?(' + '|'.join(MONTHS) + r')(?:\s+(\d{4}))?', text):
            d1, d2, mon, y = m.groups()
            if y and int(y) != year:
                continue
            best = (int(d1), int(d2) if d2 else None, MONTHS[mon])
            break
    if not best:
        return None, None
    d1, d2, mo = best
    s = f'{year}-{mo:02d}-{d1:02d}'
    return s, (f'{year}-{mo:02d}-{d2:02d}' if d2 else s)

def clean_text(text, title):
    out = []
    for l in text.split('\n'):
        l = l.strip()
        if not l or l == title or l.lower().startswith(('konečné výsledky', 'konečné pořadí', 'x-x-x')):
            continue
        if re.search(r'\bzde\b|ZDE|Podrobn|Pavouk|Tabulka|Fotografie|najdete|Playoff [AB]|^Úvodní ročník nově vzniklé|^Hlavním důvodem vzniku', l):
            continue
        out.append(l)
    t = ' '.join(out)
    t = re.sub(r'(\d+)\s*:\s*(\d+)', r'\1:\2', t)          # scores 25 : 2 -> 25:2
    t = re.sub(r'(\w) : (\w)', r'\1 – \2', t)                   # finalists "A : B" -> "A – B"
    t = re.sub(r'\s+([.,;!?])', r'\1', t)
    t = t.replace('Itále', 'Itálie').replace(' * ', ', ')
    t = re.sub(r'(\S) Finále:', r'\1. Finále:', t).replace('.. Finále', '. Finále')
    if t and t[0].islower() and title:
        t = f'{title} {t}'
    t = re.sub(r'\b([vVsSkKzZoOuUiIaA]) ', '\\1\u00a0', t)  # nbsp after one-letter prepositions
    return t.strip()

def place_of(cell, prev):
    m = re.match(r'\s*(\d+)\s*\.?', cell or '')
    return int(m.group(1)) if m else prev

def table_rows(t):
    rows = t['rows']
    head = [h.lower() for h in rows[0]]
    if not head or not head[0].startswith('míst'):
        return None, None
    return head, rows[1:]

def num(s):
    s = (s or '').replace(',', '.').replace(' ', '').strip()
    if s in ('', '-', '–', '0', 'x'):
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return int(v) if v == int(v) else v


def main():
    pages = json.load(open(sys.argv[1], encoding='utf-8'))
    pl = Players(sys.argv[2])
    pl.first_names(pages)
    report = defaultdict(list)
    editions = {}       # (code, year) -> dict

    def edition_from(path, code, year, page, results=None, division='singles', club_col=None, country_col=None, external=None):
        e = editions.setdefault((code, year), {'code': code, 'year': year, 'report': '', 'results': {}, 'old_url': [], 'external': None, 'start': None, 'end': None})
        e['old_url'].append(path)
        txt = clean_text(page['text'], page['title'])
        if txt and not e['report']:
            e['report'] = txt
        s, en = find_dates(page['title'] + '\n' + page['text'], year)
        if s and not e['start']:
            e['start'], e['end'] = s, en
        if external and not e['external']:
            e['external'] = external
        if results:
            e['results'][division] = results
        return e

    def parse_results(t, comp, czech=True, ecc_year=None):
        head, rows = table_rows(t)
        if not head:
            return []
        ci = {h: i for i, h in enumerate(head)}
        name_i = next((i for h, i in ci.items() if h.startswith('jméno')), 1)
        swap = (ecc_year not in (2004, 2005, 2009)) if ecc_year else pl.surname_first([r[name_i] for r in rows if len(r) > name_i])
        cty_i = next((i for h, i in ci.items() if h in ('stát', 'země')), None)
        club_i = ci.get('klub')
        out, prev = [], 0
        for r in rows:
            if len(r) <= name_i or not r[name_i].strip():
                continue
            place = place_of(r[0], prev)
            prev = place
            raw = r[name_i]
            if swap:
                raw = flip(raw)
            country = (r[cty_i].strip().upper() if cty_i is not None and cty_i < len(r) else None) or None
            if country in ('ČR', 'CZE', 'CZ', 'ČESKO'):
                country = 'CZ'
            if czech:
                pid, canon = pl.resolve(raw, country=country, create=True)
                row = {'place': place, 'player': pid}
            else:
                # Eurocup: Czech players and people known from Czech events get their id, others a plain name.
                pid, canon = pl.resolve(raw, country=country, create=(country == 'CZ'))
                row = {'place': place, 'player': pid, 'country': country} if pid else {'place': place, 'name': ' '.join(raw.split()), 'country': country}
            if club_i is not None and club_i < len(r) and r[club_i].strip():
                row['club_at_time'] = r[club_i].strip()
            out.append(row)
        return out

    def rankings_written(year, stand, eds, scale, path):
        rel = f'rankings/mcr-{year}.yaml'
        if os.path.exists(os.path.join(DATA, rel)):
            report['kept'].append(rel)
            return
        w = max(len(p) for p, _ in stand) + 1
        lines = [
            f'year: {year}', 'audience: open', f'name: {{ cs: Mistrovství ČR {year}, en: Czech Championship {year} }}',
            f'editions: [{", ".join(eds)}]', 'best_of: 2',
            'points: published           # published = opsané ze starého webu | computed = spočítá build',
            f'scale: {scale}', 'check: false                # staré roky: body podle tehdejšího pravidla, jen opsané', f'source: old-site            # {path}', '',
            '# body za [jarní, druhý, open cup]; ~ = nehrál', 'standings:',
        ]
        for pid, pts in stand:
            lines.append(f'  {(pid + ":").ljust(w)} [{", ".join("~" if p is None else str(p) for p in pts)}]')
        write(rel, '\n'.join(lines) + '\n')

    for path, page in sorted(pages.items(), key=lambda kv: (kv[0].startswith('/ecc/'), kv[0])):
        if path.startswith('/english'):
            continue
        m = (re.match(r'/turnaje/(cocp|druhy|jarni|tcc)/\1_(\d{4})\.php$', path)
             or re.match(r'/(pcl|cml|ecc|ol)/\1_(\d{4})\.php$', path))
        if m:
            code, year = m.group(1), int(m.group(2))
            res = []
            for t in page['tables']:
                res = parse_results(t, code, czech=(code != 'ecc'), ecc_year=(year if code == 'ecc' else None))
                if res:
                    break
            ext = next((h for h, _ in page['links'] if h.startswith('http') and 'carrom.cz' not in h and 'docs.google' not in h and 'facebook' not in h and 'lib.cas.cz' not in h), None)
            edition_from(path, code, year, page, res or None, external=ext)
            continue
        m = re.match(r'/mcr/mcr_(\d{4})\.php$', path)
        if m:
            year = int(m.group(1))
            tabs = [t for t in page['tables'] if table_rows(t)[0]]
            rank = next((t for t in tabs if any('součet' in h for h in t['rows'][0])), None)
            junior = next((t for t in tabs if t is not rank), None)
            if rank:
                report['rankings'].append(year)
                head, rows = table_rows(rank)
                cols = [i for i, h in enumerate(head) if i >= 2 and 'součet' not in h]
                stand = []
                mx = 0
                swap = pl.surname_first([r[1] for r in rows if len(r) > 1])
                for r in rows:
                    if len(r) < 3 or not r[1].strip():
                        continue
                    pid, canon = pl.resolve(flip(r[1]) if swap else r[1], create=True, mcr=True)
                    pts = [num(r[i]) if i < len(r) else None for i in cols]
                    mx = max([mx] + [p for p in pts if p])
                    stand.append((pid, pts))
                editions_ids = [f'jarni/{year}', f'druhy/{year}', f'cocp/{year}']
                rankings_written(year, stand, editions_ids, 1000 if mx > 100 else 100, path)
                for c in ('jarni', 'druhy', 'cocp'):
                    editions.setdefault((c, year), {'code': c, 'year': year, 'report': '', 'results': {}, 'old_url': [], 'external': None, 'start': None, 'end': None})
            if junior:
                res = parse_results(junior, 'mcrj')
                txt = page['text']
                jt = txt[txt.find('juniorů'):] if 'juniorů' in txt else ''
                e = editions.setdefault(('mcrj', year), {'code': 'mcrj', 'year': year, 'report': '', 'results': {}, 'old_url': [], 'external': None, 'start': None, 'end': None})
                e['old_url'].append(path + '#juniori')
                e['results']['juniors'] = res
                s, en = find_dates(jt, year)
                if s:
                    e['start'], e['end'] = s, en
                line = next((l for l in jt.split('\n') if 'odehr' in l), '')
                if line:
                    e['report'] = clean_text(line, '')
            continue

    # ---- write editions
    for (code, year), e in sorted(editions.items()):
        rel = f'editions/{code}/{year}.yaml'
        path = os.path.join(DATA, rel)
        if os.path.exists(path):
            cur = load_yaml(path)
            has = any((v or []) for v in (cur.get('results') or {}).values())
            if has or not any(e['results'].values()):
                report['kept'].append(rel)
                continue
            # add results to an existing edition without them
            text = open(path, encoding='utf-8').read()
            text = re.sub(r'^results:.*(\n  .*)*', '', text, flags=re.M).rstrip('\n')
            text += '\n\n' + results_yaml(e['results']) + '\n'
            write(rel, text)
            report['filled'].append(rel)
            continue
        lines = [f'competition: {code}', f'year: {year}', 'status: finished']
        if e['start']:
            lines.append(f"start_date: {e['start']}")
            if code not in ('pcl', 'cml', 'ol'):
                lines.append(f"end_date: {e['end']}")
        if e['report']:
            lines.append('report:')
            lines.append('  cs: ' + block(e['report'], 4))
        if e['external']:
            lines.append(f"external_url: {q(e['external'])}")
        lines.append('source: old-site')
        if e['old_url']:
            lines.append(f"old_url: {q(e['old_url'][0])}")
        lines.append('')
        lines.append(results_yaml(e['results']) if any(e['results'].values()) else 'results: {}')
        write(rel, '\n'.join(lines) + '\n')
        report['editions'].append(rel)

    pl.save()
    redirects(pages, editions)
    print(f"Editions written: {len(report['editions'])}, filled: {report['filled']}, kept: {len(report['kept'])}")
    print(f"Rankings: {report['rankings']}")
    print(f"New players: {len(pl.new)}")
    if DRY:
        print('\n'.join(written))


def results_yaml(results):
    lines = ['results:']
    for div, rows in results.items():
        if not rows:
            continue
        lines.append(f'  {div}:')
        for r in rows:
            lines.append('    - ' + flow(r))
    return '\n'.join(lines)


def redirects(pages, editions):
    """Old URL -> new URL map for the 404 page (GitHub Pages cannot redirect on the server)."""
    out = {}
    leagues = {'pcl', 'cml', 'ol'}
    static = {
        '/': '/', '/index.php': '/', '/novinky/': '/novinky/', '/novinky/archiv.php': '/novinky/', '/novinky/archiv_1.php': '/novinky/',
        '/asociace/': '/asociace/', '/asociace/rada.php': '/asociace/#dokumenty', '/asociace/vh.php': '/asociace/#dokumenty',
        '/carrom/': '/hra-carrom/', '/galerie/': '/galerie/', '/kalendar/': '/kalendar/', '/odkazy/': '/vice/',
        '/kontakty/': '/asociace/#kontakty', '/turnaje/': '/vysledky/', '/turnaje/index.php': '/vysledky/', '/mcr/': '/vysledky/mcr/',
        '/ecc/': '/vysledky/ecc/', '/pcl/': '/ligy/pcl/', '/cml/': '/ligy/cml/', '/ol/': '/ligy/ol/', '/ts/': '/vysledky/',
        '/ts/ts_2014.php': '/vysledky/', '/turnaje/cocp/': '/vysledky/cocp/', '/turnaje/druhy/': '/vysledky/druhy/',
        '/turnaje/jarni/': '/vysledky/jarni/', '/turnaje/tcc/': '/vysledky/tcc/', '/ecc/ecc_story_2011.php': '/vysledky/ecc/2011/',
        '/english/': '/en/', '/kalendar.php': '/kalendar/', '/vysledky.php': '/vysledky/',
    }
    out.update(static)
    for path in pages:
        p = path[:-5] if path.endswith('index') else path
        if p in out:
            continue
        m = re.match(r'/turnaje/(cocp|druhy|jarni|tcc)/\1_(\d{4})\.php$', p) or re.match(r'/(ecc)/ecc_(\d{4})\.php$', p)
        if m:
            out[p] = f'/vysledky/{m.group(1)}/{m.group(2)}/'; continue
        m = re.match(r'/(pcl|cml|ol)/\1_(\d{4})\.php$', p)
        if m:
            out[p] = f'/ligy/{m.group(1)}/{m.group(2)}/'; continue
        m = re.match(r'/pcl/playoff(\d{4})/', p)
        if m:
            out[p] = f'/ligy/pcl/{m.group(1)}/'; continue
        m = re.match(r'/mcr/mcr_(\d{4})\.php$', p)
        if m:
            out[p] = f'/vysledky/mcr/{m.group(1)}/'; continue
        if p.startswith('/kontakty/'):
            out[p] = '/asociace/#kontakty'; continue
        if p.startswith('/english/'):
            out[p] = '/en/the-game/' if 'game' in p or 'rules' in p or 'carrom' in p else '/en/'; continue
        if p.startswith('/turnaje/zahranicni/'):
            out[p] = '/vysledky/'; continue
    lines = ['# Staré adresy → nové. GitHub Pages neumí přesměrování na serveru, proto je řeší stránka 404.',
             '# Vygenerováno z mapy starého webu (tools/import/oldsite_import.py), ruční úpravy vítány.']
    for k in sorted(out):
        lines.append(f'{q(k)}: {q(out[k])}')
    write('redirects.yaml', '\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
