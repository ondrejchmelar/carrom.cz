"""Parse cached pages of the old carrom.cz (plain PHP site) into a JSON list of pages with tables.

Usage: python3 -I tools/import/oldsite_parse.py <cache-dir> > pages.json
The cache holds one file per URL path with "/" replaced by "__" (see tools/import/README.md).
"""
import html, json, os, re, sys
from html.parser import HTMLParser


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.depth = 0
        self.title = ''
        self._title = None
        self.tables = []      # [{caption, rows: [[cell text]]}]
        self._table = None
        self._row = None
        self._cell = None
        self._caption = None
        self.links = []       # (href, text)
        self._a = None
        self.text = []        # main text outside tables

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'div' and a.get('id') == 'main':
            self.in_main = True
        if not self.in_main:
            return
        if tag == 'span' and a.get('class') == 'nadpis':
            self._title = []
        elif tag == 'table':
            self._table = {'caption': '', 'rows': []}
        elif tag == 'caption':
            self._caption = []
        elif tag == 'tr' and self._table is not None:
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []
        elif tag == 'a':
            self._a = [a.get('href', ''), []]
        elif tag == 'br':
            self._push('\n')

    def handle_endtag(self, tag):
        if not self.in_main:
            return
        if tag == 'span' and self._title is not None:
            self.title = ' '.join(''.join(self._title).split())
            self._title = None
        elif tag == 'caption' and self._caption is not None:
            self._table['caption'] = ' '.join(''.join(self._caption).split())
            self._caption = None
        elif tag in ('td', 'th') and self._cell is not None:
            self._row.append(' '.join(''.join(self._cell).split()))
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if any(self._row):
                self._table['rows'].append(self._row)
            self._row = None
        elif tag == 'table' and self._table is not None:
            if self._table['rows']:
                self.tables.append(self._table)
            self._table = None
        elif tag == 'a' and self._a is not None:
            self.links.append((self._a[0], ' '.join(''.join(self._a[1]).split())))
            self._a = None

    def _push(self, data):
        if self._title is not None: self._title.append(data)
        if self._caption is not None: self._caption.append(data)
        elif self._cell is not None: self._cell.append(data)
        elif self._table is None: self.text.append(data)
        if self._a is not None: self._a[1].append(data)

    def handle_data(self, data):
        if self.in_main:
            if 'TEXTOVA CAST STRANKY - KONEC' in data:
                return
            self._push(data)

    def handle_comment(self, data):
        if 'TEXTOVA CAST STRANKY - KONEC' in data:
            self.in_main = False


def parse(path):
    raw = open(path, 'rb').read()
    try:
        s = raw.decode('utf-8')
    except UnicodeDecodeError:
        s = raw.decode('windows-1250')
    p = Page()
    p.feed(s)
    text = re.sub(r'[ \t\r\f\v]+', ' ', ''.join(p.text))
    text = '\n'.join(l.strip() for l in text.split('\n') if l.strip())
    return {'title': p.title, 'text': text, 'tables': p.tables, 'links': p.links}


if __name__ == '__main__':
    d = sys.argv[1]
    out = {}
    for f in sorted(os.listdir(d)):
        out['/' + f.replace('__', '/')] = parse(os.path.join(d, f))
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
