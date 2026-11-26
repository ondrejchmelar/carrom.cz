"""Import the news of the old carrom.cz (novinky/index.php and the two archive pages) as Markdown articles.

The old site has no dates on news items, so the date is derived: years and dates written in the text,
kept in order (the pages list the newest item first). Such articles get `date_approx: true`.

Usage: python3 -I tools/import/oldsite_news.py <cache-dir> <docmap.json>
"""
import html, json, os, re, sys, unicodedata, urllib.parse
from html.parser import HTMLParser

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('NEWS_OUT') or os.path.join(ROOT, 'content', 'articles')
MONTHS = {'ledna': 1, 'února': 2, 'března': 3, 'dubna': 4, 'května': 5, 'června': 6, 'července': 7, 'srpna': 8, 'září': 9, 'října': 10, 'listopadu': 11, 'prosince': 12}


def ascii_(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()


class News(HTMLParser):
    """Collects (title, body-markdown) pairs from <span class=nadpis> / <span class=text>."""

    def __init__(self, base, link_map):
        super().__init__(convert_charrefs=True)
        self.base, self.link_map = base, link_map
        self.items, self.cur, self.mode, self.depth, self.href = [], None, None, 0, None
        self.linktext = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get('class') or '').lower()
        if tag == 'span' and cls == 'nadpis':
            self.cur = {'title': '', 'body': ''}
            self.items.append(self.cur)
            self.mode, self.depth = 'title', 1
            return
        if tag == 'span' and cls == 'text' and self.cur is not None and self.mode is None:
            self.mode, self.depth = 'body', 1
            return
        if self.mode is None:
            return
        if tag == 'span':
            self.depth += 1
        elif tag == 'br':
            self.out('\n')
        elif tag in ('b', 'strong'):
            self.out('**')
        elif tag == 'a' and self.mode == 'body':
            self.href = self.map(a.get('href', ''))
            self.linktext = []
        elif tag == 'img' and self.mode == 'body':
            src = self.map(a.get('src', ''))
            if src.startswith('http'):
                self.out(f'\n\n![]({src})\n\n')

    def handle_endtag(self, tag):
        if self.mode is None:
            return
        if tag == 'span':
            self.depth -= 1
            if self.depth == 0:
                self.mode = None
        elif tag in ('b', 'strong'):
            self.out('**')
        elif tag == 'a' and self.href is not None:
            text = ''.join(self.linktext).strip() or self.href
            href, self.href = self.href, None
            self.out(f'[{text}]({href})' if href else text)

    def handle_data(self, data):
        if self.mode is None:
            return
        if self.href is not None:
            self.linktext.append(' '.join(data.split()) if data.strip() else ' ')
        else:
            self.out(data)

    def handle_comment(self, data):
        pass

    def out(self, s):
        if self.href is not None and self.mode == 'body':
            self.linktext.append(s)
            return
        self.cur[self.mode] += s

    def map(self, href):
        if not href or href.lower().startswith(('mailto:', 'javascript:')):
            return href if href.lower().startswith('mailto:') else ''
        u = urllib.parse.urljoin(self.base, href)
        sp = urllib.parse.urlsplit(u)
        if sp.netloc in ('carrom.cz', 'www.carrom.cz'):
            path = urllib.parse.unquote(sp.path)
            if path in self.link_map:
                return self.link_map[path]
            return ''  # page or file of the old site that did not move: keep the text, drop the link
        return u


def clean(s):
    s = s.replace('\xa0', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    s = re.sub(r'\*\*\s*\*\*', '', s)
    paras = [p.strip() for p in re.split(r'\n{2,}', s)]
    paras = [' '.join(p.split('\n')) if not p.startswith('![') else p for p in paras if p]
    out = '\n\n'.join(paras)
    out = re.sub(r'\b([vVsSkKzZoOuUiIaA]) ', '\\1\u00a0', out)
    return out.strip()


def dates_in(text):
    """Yield (year or None, month, day) for dates written in the text."""
    for m in re.finditer(r'(\d{1,2})\.\s*(?:[-–]\s*\d{1,2}\.\s*)?(\d{1,2})\.\s*(\d{4})?', text):
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        if 1 <= d <= 31 and 1 <= mo <= 12:
            yield (int(y) if y else None, mo, d)
    for m in re.finditer(r'(\d{1,2})\.\s*(?:[-–a]\s*(?:\d{1,2}\.\s*)?)?(' + '|'.join(MONTHS) + r')(?:\s+(\d{4}))?', text):
        yield (int(m.group(3)) if m.group(3) else None, MONTHS[m.group(2)], int(m.group(1)))


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', ascii_(s).lower()).strip('-')[:60].strip('-')


def main():
    cache, docmap = sys.argv[1], json.load(open(sys.argv[2], encoding='utf-8'))
    red = yaml.safe_load(open(os.path.join(ROOT, 'data', 'redirects.yaml'), encoding='utf-8')) or {}
    link_map = {**{k: v for k, v in red.items()}, **docmap}
    items = []
    for f, base in (('novinky__index', 'https://carrom.cz/novinky/'), ('novinky__archiv_1.php', 'https://carrom.cz/novinky/'), ('novinky__archiv.php', 'https://carrom.cz/novinky/')):
        raw = open(os.path.join(cache, f), 'rb').read().decode('utf-8', 'replace')
        raw = re.sub(r'(?s)<!--.*?-->', '', raw)  # commented-out items and templates
        raw = raw[raw.find('id="main"'):]
        p = News(base, link_map)
        p.feed(raw)
        for it in p.items:
            t = ' '.join(it['title'].replace('**', '').split())
            if not t or t.startswith('...'):
                continue
            items.append({'title': t, 'body': clean(it['body']), 'src': f})

    # dates: newest first, never later than the item above
    prev = (2026, 11, 26)
    for it in items:
        text = it['title'] + ' ' + it['body']
        years = [int(y) for y in re.findall(r'\b(20[0-2]\d)\b', text) if int(y) <= prev[0]]
        found = list(dates_in(text))
        year = None
        dated = [(y, mo, d) for y, mo, d in found if y and y <= prev[0]]
        if dated:
            year = max(y for y, _, _ in dated)
        elif years:
            year = max(years)
        else:
            year = prev[0]
        cands = [(year, mo, d) for y, mo, d in found if (y or year) == year and (year, mo, d) <= prev]
        if cands:
            date = max(cands)
        elif year < prev[0]:
            date = (year, 12, 15)
        else:
            date = prev
        if date > prev:
            date = prev
        it['date'] = date
        prev = date

    seen = set()
    written = 0
    for it in items:
        y, mo, d = it['date']
        slug = slugify(it['title']) or 'zprava'
        base_slug, n = slug, 2
        while (y, slug) in seen:
            slug = f'{base_slug}-{n}'; n += 1
        seen.add((y, slug))
        perex = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', it['body'].split('\n\n')[0]).replace('**', '')
        perex = perex if len(perex) <= 220 else perex[:217].rsplit(' ', 1)[0] + '…'
        fm = {
            'title': it['title'], 'slug': slug, 'perex': perex,
            'publish_at': f'{y}-{mo:02d}-{d:02d}T12:00:00+01:00', 'status': 'published', 'pinned': False,
            'tags': ['archiv'], 'date_approx': True, 'source': 'old-site',
        }
        if not perex:
            del fm['perex']
        dirn = os.path.join(OUT, str(y))
        os.makedirs(dirn, exist_ok=True)
        path = os.path.join(dirn, f'{y}-{mo:02d}-{d:02d}-{slug}.cs.md')
        if os.path.exists(path):
            continue
        body = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, width=1000).strip()
        open(path, 'w', encoding='utf-8').write(f'---\n{body}\n---\n\n{it["body"]}\n')
        written += 1
    print(f'items {len(items)}, written {written}')
    by_year = {}
    for it in items:
        by_year[it['date'][0]] = by_year.get(it['date'][0], 0) + 1
    print(dict(sorted(by_year.items())))


if __name__ == '__main__':
    main()
