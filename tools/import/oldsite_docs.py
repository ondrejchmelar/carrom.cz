"""Copy documents (PDF, Word, Excel) linked from the old carrom.cz into public/uploads/archiv/ and
create data/documents/<year>/<id>.yaml for those that belong to a season or to the association.

Usage: python3 -I tools/import/oldsite_docs.py pages.json downloads.csv [--no-download]
Old document URLs are added to data/redirects.yaml, so links from elsewhere keep working.
"""
import csv, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA, PUB = os.path.join(ROOT, 'data'), os.path.join(ROOT, 'public')
DOC_EXT = ('.pdf', '.doc', '.docx', '.xls', '.xlsx')
MAX_BYTES = 8_000_000
KIND_CS = {'results': 'Výsledky', 'propozice': 'Propozice', 'rules': 'Pravidla', 'poster': 'Plakát', 'minutes': 'Zápis', 'statutes': 'Stanovy', 'other': 'Dokument'}
KIND_EN = {'results': 'Results', 'propozice': 'Tournament information', 'rules': 'Rules', 'poster': 'Poster', 'minutes': 'Minutes', 'statutes': 'Statutes', 'other': 'Document'}
COMP_CS = {'pcl': 'Pražská carromová liga', 'cml': 'Medlešická liga', 'cocp': 'Carrom Open Cup Praha', 'druhy': 'Turnaj MČR Letohrad',
           'jarni': 'Jarní turnaj MČR', 'tcc': 'Terrace Carrom Cup', 'ecc': 'Carrom Eurocup', 'mcr': 'Mistrovství ČR', 'ol': 'Bernard Opoliga'}
COMP_EN = {'pcl': 'Prague Carrom League', 'cml': 'Medlešice League', 'cocp': 'Carrom Open Cup Prague', 'druhy': 'Letohrad Czech Championship tournament',
           'jarni': 'Spring Czech Championship tournament', 'tcc': 'Terrace Carrom Cup', 'ecc': 'Carrom Eurocup', 'mcr': 'Czech Championship', 'ol': 'Bernard Opoliga'}


def ascii_(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()


def new_path(old):
    """/adresar_dokumenty/Results ICF Cup.pdf -> /uploads/archiv/adresar_dokumenty/Results-ICF-Cup.pdf"""
    p = urllib.parse.unquote(old)
    parts = [re.sub(r'[^A-Za-z0-9._-]+', '-', ascii_(x)).strip('-') for x in p.strip('/').split('/')]
    return '/uploads/archiv/' + '/'.join(parts)


def kind_of(name, text=''):
    n = (ascii_(name) + ' ' + ascii_(text)).lower()
    if re.search(r'vysled|poradi|result|tabulk|standing', n): return 'results'
    if re.search(r'pravidl|rules', n): return 'rules'
    if re.search(r'plakat|poster', n): return 'poster'
    if re.search(r'stanov', n): return 'statutes'
    if re.search(r'rada|vh_|-vh|zapis', n): return 'minutes'
    if re.search(r'propoz|prospect|info|pozvank|invitation|cz\.|en\.', n): return 'propozice'
    return 'other'


def q(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    pages = json.load(open(sys.argv[1], encoding='utf-8'))
    ok = {}
    for r in csv.DictReader(open(sys.argv[2], encoding='utf-8')):
        if r['status'] == '200':
            ok[urllib.parse.unquote(urllib.parse.urlsplit(r['url']).path)] = int(r['bytes'] or 0)
    download = '--no-download' not in sys.argv

    wanted = {}   # old path -> {kind, edition, page, text}
    for page_path, page in pages.items():
        if page_path.startswith('/english'):
            continue
        base = 'https://carrom.cz' + page_path.replace('/index', '/')
        m = (re.match(r'/turnaje/(cocp|druhy|jarni|tcc)/\1_(\d{4})\.php$', page_path)
             or re.match(r'/(pcl|cml|ecc|ol)/\1_(\d{4})\.php$', page_path)
             or re.match(r'/(mcr)/mcr_(\d{4})\.php$', page_path))
        edition = f'{m.group(1)}/{m.group(2)}' if m and m.group(1) != 'mcr' else None
        for href, text in page['links']:
            if not href or href.lower().startswith(('mailto:', 'javascript:')):
                continue
            u = urllib.parse.urljoin(base, href)
            sp = urllib.parse.urlsplit(u)
            if sp.netloc not in ('carrom.cz', 'www.carrom.cz'):
                continue
            path = urllib.parse.unquote(sp.path)
            if not path.lower().endswith(DOC_EXT) or path not in ok or ok[path] > MAX_BYTES:
                continue
            info = wanted.setdefault(path, {'kind': kind_of(path, text), 'edition': None, 'year': None, 'pages': []})
            info['pages'].append(page_path)
            if edition and not info['edition']:
                info['edition'] = edition
            if page_path.startswith('/asociace/'):
                info['kind'] = 'minutes' if ('rada' in path or 'vh' in path.lower()) else ('statutes' if 'stanov' in path.lower() else info['kind'])
            if m and not info['year']:
                info['year'] = int(m.group(2))

    # download
    done = 0
    for path in sorted(wanted):
        dest = os.path.join(PUB, new_path(path).lstrip('/'))
        if os.path.exists(dest) or not download:
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        url = 'https://carrom.cz' + urllib.parse.quote(path)
        for attempt in range(5):
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'carrom-migration/1.0'}), timeout=60).read()
                open(dest, 'wb').write(data); done += 1
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(5 * (attempt + 1)); continue
                print('ERR', e.code, url); break
            except Exception as e:  # noqa: BLE001
                print('ERR', e, url); time.sleep(3)
        time.sleep(1.1)
    print(f'downloaded {done}, wanted {len(wanted)}')

    # document records for seasons and the association
    eds = {}
    for code in os.listdir(os.path.join(DATA, 'editions')):
        for f in os.listdir(os.path.join(DATA, 'editions', code)):
            txt = open(os.path.join(DATA, 'editions', code, f), encoding='utf-8').read()
            m = re.search(r'^start_date:\s*(\S+)', txt, re.M)
            eds[f'{code}/{f[:-5]}'] = m.group(1) if m else None
    made = 0
    seen_ids = set()
    for path, info in sorted(wanted.items()):
        if not os.path.exists(os.path.join(PUB, new_path(path).lstrip('/'))):
            continue
        kind = info['kind']
        if info['edition']:
            code, year = info['edition'].split('/')
            if info['edition'] not in eds:
                continue
            date = eds[info['edition']] or f'{year}-01-01'
            title_cs = f'{KIND_CS[kind]} – {COMP_CS[code]} {year}'
            title_en = f'{KIND_EN[kind]} – {COMP_EN[code]} {year}'
        elif kind in ('minutes', 'statutes'):
            m = re.search(r'(\d{4})[-_](\d{2})[-_](\d{2})', path) or re.search(r'(\d{4})', path)
            y = m.group(1) if m else '2010'
            date = f'{m.group(1)}-{m.group(3)}-{m.group(2)}' if m and m.lastindex == 3 and int(m.group(2)) > 12 else (f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m and m.lastindex == 3 else f'{y}-01-01')
            body = 'rady' if 'rada' in path else 'valné hromady'
            body_en = 'board meeting' if 'rada' in path else 'general meeting'
            d = date.split('-')
            title_cs = 'Stanovy České carromové asociace' if kind == 'statutes' else f'Zápis z {body} {int(d[2])}. {int(d[1])}. {d[0]}' if d[1] != '01' or d[2] != '01' else f'Zápis z {body} {y}'
            title_en = 'Statutes of the Czech Carrom Association' if kind == 'statutes' else f'Minutes of the {body_en}, {date}'
        else:
            continue
        year = date[:4]
        base_id = re.sub(r'[^a-z0-9]+', '-', ascii_(os.path.splitext(os.path.basename(path))[0]).lower()).strip('-')
        did, n = base_id, 2
        while (year, did) in seen_ids:
            did = f'{base_id}-{n}'; n += 1
        seen_ids.add((year, did))
        rel = os.path.join(DATA, 'documents', year, f'{did}.yaml')
        if os.path.exists(rel):
            continue
        os.makedirs(os.path.dirname(rel), exist_ok=True)
        lines = ['title:', f'  cs: {q(title_cs)}', f'  en: {q(title_en)}', f'kind: {kind}', f'date: {date}']
        if info['edition']:
            lines.append(f"edition: {info['edition']}")
        lines += ['file:', f'  cs: {new_path(path)}', 'old_urls:', f'  - {q(path)}', 'source: old-site']
        open(rel, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
        made += 1
    print(f'documents written: {made}')

    # redirects for every copied file
    red = os.path.join(DATA, 'redirects.yaml')
    text = open(red, encoding='utf-8').read().rstrip('\n')
    have = set(re.findall(r'^"?([^":]+)"?:', text, re.M))
    add = [f'{q(p)}: {q(new_path(p))}' for p in sorted(wanted) if p not in have and os.path.exists(os.path.join(PUB, new_path(p).lstrip('/')))]
    if add:
        text += '\n# dokumenty\n' + '\n'.join(add)
    open(red, 'w', encoding='utf-8').write(text + '\n')
    print(f'redirects added: {len(add)}')
    json.dump({p: new_path(p) for p in wanted}, open(os.path.join(os.path.dirname(sys.argv[1]), 'docmap.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
