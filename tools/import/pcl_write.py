"""Write final places of PCL 2017–2025 (from pcl_playoff.py output) into data/editions/pcl/<year>.yaml.

The old brackets only show first names; NAMES maps them to player ids (checked with Ondrej, 2026-11).
Usage: python3 -I tools/import/pcl_write.py pcl.json
"""
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

NAMES = {
    'Franta': 'frantisek-rezek', 'Franta R.': 'frantisek-rezek',
    'Franta II': 'frantisek-cervenka', 'Franta II.': 'frantisek-cervenka', 'Franta Č.': 'frantisek-cervenka', 'Franta Č:': 'frantisek-cervenka',
    'Zdeněk': 'zdenek-svitak', 'Zdenda': 'zdenek-svitak', 'Ondřej': 'ondrej-chmelar', 'Filip': 'filip-smoljak',
    'Neel': 'neel-vasanth', 'Honza': 'jan-tesitel', 'Jan': 'jan-tesitel', 'Raj': 'raj-patil', 'Michal': 'michal-fucik',
    'Romana': 'romana-kralova', 'Tomáš': 'tomas-chmelar', 'Šéfik': 'pavel-schierl', 'Adrian': 'adrian-dean',
    'Zdeňka': 'zdenka-chmelarova', 'Zdenička': 'zdenka-chmelarova', 'Tadeáš': 'tadeas-matys', 'Horst': 'horst-simunsky',
    'HORST': 'horst-simunsky', 'Karlos': 'karlos-novak', 'Dominika': 'dominika-krestanova', 'Shiw': 'shiv-sah',
    'Sekhesh': 'ajay-sekhesh', 'Selvamani': 'selvamani-thirumurugan',
    'Lukáš': 'lukas-navratil', 'Lenka': 'lenka-prazakova', 'Aleš': 'ales-krestan', 'Shoeb': 'shoeb-ahmed-khan',
}
NAMES.update(json.loads(os.environ.get('PCL_EXTRA', '{}')))  # answers for the uncertain first names


def main():
    data = json.load(open(sys.argv[1], encoding='utf-8'))
    players = {f[:-5] for f in os.listdir(os.path.join(ROOT, 'data', 'players'))}
    for year, groups in sorted(data.items()):
        if int(year) >= 2026:
            continue  # the running season is entered in the admin
        rows, missing = [], []
        for g in ('A', 'B'):
            for place, name in groups.get(g, []):
                name = re.sub(r'<[^>]+>', '', name).strip()
                if not name or name in ('?', 'XY'):
                    continue
                pid = NAMES.get(name)
                if not pid or pid not in players:
                    missing.append(f'{place}. {name}')
                    continue
                rows.append((place, pid))
        path = os.path.join(ROOT, 'data', 'editions', 'pcl', f'{year}.yaml')
        text = open(path, encoding='utf-8').read()
        if re.search(r'^results:\s*\n\s+singles:\s*\n\s+- ', text, re.M):
            print(year, 'already has results, skipped'); continue
        text = re.sub(r'^results:.*(\n  .*)*', '', text, flags=re.M).rstrip('\n')
        lines = ['results:', '  singles:'] + [f'    - {{ place: {p}, player: {pid} }}' for p, pid in sorted(rows)]
        text += '\n\n# Konečné pořadí z pavouků playoff na starém webu (skupina A = 1.–8., B = 9.–16.)\n' + '\n'.join(lines) + '\n'
        open(path, 'w', encoding='utf-8').write(text)
        print(year, len(rows), 'places', ('missing: ' + ', '.join(missing)) if missing else '')


if __name__ == '__main__':
    main()
