"""Import final places from SoL (Scarry On Line, https://sol5.metapensiero.it/lit/) into data/editions.

Usage:
  python3 tools/import/sol.py <SoL Lit URL> [--edition code/year] [--division singles] [--force] [--dry-run] [--report report.md]

The URL is a tourney (/lit/tourney/<id>) or a whole championship (/lit/championship/<id>). A tourney goes into
the edition whose start_date equals the tourney date (or the one given with --edition). Editions that already have
results are skipped unless --force.

Players are matched by their SoL id (field `sol` in data/players/<id>.yaml), then by name, nickname and `spellings`.
Players from Czechia without a match get a new player file (mcr: true). Players from abroad without a file are
written as plain `name` + `country` rows, like the Eurocup results. Guessed matches and new players are listed in
the report, so the editor can check them in the pull request.

SoL Lit is behind an Anubis proof-of-work bot check. The client solves it (Ondrej approved this, 2026-11-26),
identifies itself in the User-Agent and waits between requests.
"""
import argparse, glob, hashlib, html, json, os, re, sys, time, unicodedata, urllib.parse

import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'data')
BASE = 'https://sol5.metapensiero.it'
UA = 'carrom-cz-importer/1.0 (+https://carrom.cz; results import for the Czech Carrom Association)'
PAUSE = 1.5
COUNTRY = {
    'Czechia': 'CZ', 'Czech Republic': 'CZ', 'Slovakia': 'SK', 'Germany': 'DE', 'France': 'FR', 'Italy': 'IT',
    'Switzerland': 'CH', 'Poland': 'PL', 'United Kingdom': 'UK', 'England': 'UK', 'Netherlands': 'NL', 'Belgium': 'BE',
    'Austria': 'AT', 'Spain': 'ES', 'Sweden': 'SE', 'Serbia': 'RS', 'Bulgaria': 'BG', 'India': 'IN', 'Sri Lanka': 'LK',
    'United States': 'US', 'United States of America': 'US', 'Slovenia': 'SL', 'Hungary': 'HU', 'Ukraine': 'UA',
    'Russia': 'RU', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Nepal': 'NP', 'Maldives': 'MV', 'Japan': 'JP',
    'Canada': 'CA', 'Denmark': 'DK', 'Norway': 'NO', 'Finland': 'FI', 'Ireland': 'IE', 'Portugal': 'PT',
}


# ---------------------------------------------------------------- fetching

class Lit:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers['User-Agent'] = UA
        self.last = 0.0

    def get(self, url):
        url = urllib.parse.urljoin(BASE, url)
        for _ in range(3):
            wait = PAUSE - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            r = self.s.get(url, timeout=60)
            self.last = time.time()
            m = re.search(r'id="anubis_challenge" type="application/json">(.*?)</script>', r.text, re.S)
            if not m:
                r.raise_for_status()
                return r.text
            self.solve(url, json.loads(m.group(1)))
        raise RuntimeError(f'SoL bot check not passed for {url}')

    def solve(self, url, ch):
        c, diff = ch['challenge'], int(ch['rules']['difficulty'])
        t0, n = time.time(), 0
        while True:
            h = hashlib.sha256(f"{c['randomData']}{n}".encode()).hexdigest()
            if h.startswith('0' * diff):
                break
            n += 1
        q = {'id': c['id'], 'response': h, 'nonce': n, 'redir': url, 'elapsedTime': int((time.time() - t0) * 1000) + 500}
        self.s.get(BASE + '/.within.website/x/cmd/anubis/api/pass-challenge', params=q, timeout=60, allow_redirects=False)


def text(s):
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s))).strip()


def parse_tourney(page):
    title = text(re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S).group(1)) if '<h1' in page else ''
    m = re.search(r'Date\s*</t[dh]>\s*<td[^>]*>\s*(\d\d)-(\d\d)-(\d{4})', page)
    date = f'{m.group(3)}-{m.group(1)}-{m.group(2)}' if m else None
    table = re.search(r'<table[^>]*class="[^"]*\branking\b[^"]*"[^>]*>(.*?)</table>', page, re.S)
    rows = []
    for tr in re.findall(r'<tr>(.*?)</tr>', table.group(1) if table else '', re.S):
        rk = re.search(r'<td class="[^"]*\brank\b[^"]*">\s*(\d+)', tr)
        pl = re.search(r'<a href="/lit/player/([0-9a-f]+)">(.*?)</a>', tr, re.S)
        if rk and pl:
            rows.append({'place': int(rk.group(1)), 'sol': pl.group(1), 'name': text(pl.group(2))})
    return {'title': title, 'date': date, 'rows': rows}


def parse_player(page):
    def field(label):
        m = re.search(rf'>\s*{label}\s*</t[dh]>\s*<td[^>]*>(.*?)</td>', page, re.S)
        return text(m.group(1)) if m else ''
    country = re.sub(r'\s*\(.*?\)\s*$', '', field('Country'))  # "Germany (citizenship)"
    return {'first': field('First name'), 'last': field('Last name'), 'country': country}


def tourneys_of_championship(page):
    return list(dict.fromkeys(re.findall(r'href="(/lit/tourney/[0-9a-f]+)"', page)))


# ---------------------------------------------------------------- players

def ascii_(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()


def key(s):
    return ' '.join(sorted(ascii_(s).lower().replace('.', ' ').split()))


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', ascii_(s).lower()).strip('-')


class Players:
    def __init__(self):
        self.files = {}
        for f in glob.glob(os.path.join(DATA, 'players', '*.yaml')):
            pid = os.path.basename(f)[:-5]
            self.files[pid] = open(f, encoding='utf-8').read()
        self.by_sol, self.by_key, self.tokens = {}, {}, {}
        for pid, t in self.files.items():
            g = lambda k: (re.search(rf'^{k}:\s*"?([^"\n]*)"?\s*$', t, re.M) or [None, ''])[1].strip()
            if g('sol'):
                self.by_sol[g('sol')] = pid
            names = [f"{g('first_name')} {g('last_name')}"]
            if 'spellings:' in t:
                names += re.findall(r'^\s+-\s+"?([^"\n]+)"?\s*$', t.split('spellings:', 1)[1], re.M)
            for n in names:
                self.by_key.setdefault(key(n), set()).add(pid)
            for tok in set(key(g('last_name')).split()):  # guesses only on a shared surname
                self.tokens.setdefault(tok, set()).add(pid)

    def match(self, row):
        """-> (player id or None, how)"""
        if row['sol'] in self.by_sol:
            return self.by_sol[row['sol']], 'sol'
        name = row['name']
        nick = re.search(r'[“"]([^”"]+)[”"]', name)
        plain = re.sub(r'\s*[“"][^”"]+[”"]', '', name).strip()
        cands = [plain]
        if nick:
            last = plain.split()[0]  # SoL writes "Last First"
            cands.append(f'{nick.group(1)} {last}')
        for c in cands:
            hit = self.by_key.get(key(c))
            if hit and len(hit) == 1:
                return next(iter(hit)), 'name'
        # one shared name with exactly one player (e.g. a long first name in SoL): a guess for the editor to check
        toks = [x for x in key(plain).split() if len(x) > 3]
        hits = set()
        for tk in toks:
            if len(self.tokens.get(tk, ())) == 1:
                hits |= self.tokens[tk]
        if len(hits) == 1:
            return next(iter(hits)), 'guess'
        return None, None

    def add_sol(self, pid, sol, dry):
        t = self.files[pid]
        if re.search(r'^sol:', t, re.M):
            return
        t = re.sub(r'^(spellings:)', f'sol: {sol}\n\\1', t, count=1, flags=re.M) if 'spellings:' in t else t.rstrip('\n') + f'\nsol: {sol}\n'
        self.files[pid] = t
        self.by_sol[sol] = pid
        if not dry:
            open(os.path.join(DATA, 'players', f'{pid}.yaml'), 'w', encoding='utf-8').write(t)

    def create(self, first, last, country, sol, dry):
        pid, n = slugify(f'{first} {last}'), 2
        base = pid
        while pid in self.files:
            pid = f'{base}-{n}'; n += 1
        t = f'first_name: {json.dumps(first, ensure_ascii=False)}\nlast_name: {json.dumps(last, ensure_ascii=False)}\ncountry: {country}\nmcr: {"true" if country == "CZ" else "false"}\nsol: {sol}\n'
        self.files[pid] = t
        self.by_sol[sol] = pid
        self.by_key.setdefault(key(f'{first} {last}'), set()).add(pid)
        if not dry:
            open(os.path.join(DATA, 'players', f'{pid}.yaml'), 'w', encoding='utf-8').write(t)
        return pid


# ---------------------------------------------------------------- editions

def editions():
    out = {}
    for f in glob.glob(os.path.join(DATA, 'editions', '*', '*.yaml')):
        t = open(f, encoding='utf-8').read()
        code = os.path.basename(os.path.dirname(f))
        m = re.search(r'^start_date:\s*(\S+)', t, re.M)
        divs = set(re.findall(r'^  (\w+):\s*\n\s+- ', t.split('\nresults:', 1)[1], re.M)) if '\nresults:' in t else set()
        out[f'{code}/{os.path.basename(f)[:-5]}'] = {'path': f, 'date': m.group(1) if m else None, 'text': t, 'divisions': divs}
    return out


def default_division(code):
    return 'juniors' if code.startswith('mcrj') else 'singles'


def write_edition(ed, division, rows, url, dry):
    t = ed['text']
    lines = ['results:', f'  {division}:']
    for r in rows:
        if r.get('player'):
            lines.append(f"    - {{ place: {r['place']}, player: {r['player']} }}")
        else:
            lines.append(f"    - {{ place: {r['place']}, name: {json.dumps(r['name'], ensure_ascii=False)}, country: {r['country']} }}")
    m = re.search(r'^results:.*(\n[ \t]+.*)*', t, re.M)
    if m:
        # keep the other divisions (e.g. singles) and replace only this one
        keep, skip = [], False
        for ln in m.group(0).split('\n')[1:]:
            d = re.match(r'^  (\w+):', ln)
            if d:
                skip = d.group(1) == division
            if not skip and ln.strip():
                keep.append(ln)
        t = t[:m.start()] + '\n'.join(['results:'] + keep + lines[1:]) + t[m.end():]
    else:
        t = t.rstrip('\n') + '\n\n' + '\n'.join(lines) + '\n'
    t = t if url is None else re.sub(r'^sol_lit_url:.*$', f'sol_lit_url: {url}', t, count=1, flags=re.M) if re.search(r'^sol_lit_url:', t, re.M) else t.replace('\nresults:', f'\nsol_lit_url: {url}\nresults:', 1)
    t = re.sub(r'^status:\s*\S+', 'status: finished', t, count=1, flags=re.M)
    if not dry:
        open(ed['path'], 'w', encoding='utf-8').write(t if t.endswith('\n') else t + '\n')


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('url')
    ap.add_argument('--edition')
    ap.add_argument('--division')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--report')
    a = ap.parse_args()

    lit, players, eds = Lit(), Players(), editions()
    path = urllib.parse.urlsplit(a.url).path
    if '/lit/championship/' in path:
        urls = tourneys_of_championship(lit.get(path))
    elif '/lit/tourney/' in path:
        urls = [path]
    else:
        sys.exit('Give a SoL Lit tourney or championship URL.')
    if a.edition and len(urls) > 1:
        sys.exit('--edition works only with a single tourney URL.')

    report = [f'## Import ze SoL\n\nZdroj: {a.url}\n']
    for u in urls:
        t = parse_tourney(lit.get(u))
        full = BASE + u
        eid = a.edition or next((k for k, e in eds.items() if e['date'] == t['date']), None)
        head = f"**{t['title']}** ({t['date']}, {len(t['rows'])} hráčů)"
        if not eid or eid not in eds:
            report.append(f'- {head}: žádný ročník s datem {t["date"]} – přeskočeno. Založ ročník v adminu a pusť import znovu.')
            continue
        ed = eds[eid]
        division = a.division or default_division(eid)
        if division in ed['divisions'] and not a.force:
            report.append(f'- {head} → `{eid}`: výsledky už jsou, přeskočeno (přepíše `--force`).')
            continue
        guessed, new, foreign = [], [], []
        out = []
        for r in t['rows']:
            pid, how = players.match(r)
            if pid:
                players.add_sol(pid, r['sol'], a.dry_run)
                if how == 'guess':
                    guessed.append(f"{r['name']} → `{pid}`")
                out.append({'place': r['place'], 'player': pid})
                continue
            info = parse_player(lit.get(f"/lit/player/{r['sol']}"))
            cc = COUNTRY.get(info['country'])
            if not cc:
                cc = info['country'][:2].upper() or '??'
                print(f"! unknown country {info['country']!r} for {r['name']}, used {cc}", file=sys.stderr)
            first, last = info['first'] or r['name'].split()[-1], info['last'] or ' '.join(r['name'].split()[:-1])
            if cc == 'CZ':
                pid = players.create(first, last, cc, r['sol'], a.dry_run)
                new.append(f'{first} {last} → `{pid}`')
                out.append({'place': r['place'], 'player': pid})
            else:
                foreign.append(f'{first} {last} ({cc})')
                out.append({'place': r['place'], 'name': f'{first} {last}', 'country': cc})
        write_edition(ed, division, out, full if division == default_division(eid) or not re.search(r'^sol_lit_url:\s*http', ed['text'], re.M) else None, a.dry_run)
        report.append(f'- {head} → `{eid}`: zapsáno {len(out)} míst.')
        if guessed:
            report.append('  - Odhadnutá shoda jména, zkontroluj: ' + '; '.join(guessed))
        if new:
            report.append('  - Noví hráči z ČR (hrají o MČR): ' + '; '.join(new))
        if foreign:
            report.append('  - Zahraniční hráči bez stránky, jen jméno a stát: ' + '; '.join(foreign))
    text_ = '\n'.join(report) + '\n'
    print(text_)
    if a.report:
        open(a.report, 'w', encoding='utf-8').write(text_)


if __name__ == '__main__':
    main()
