# Import ze starého webu (jednorázový)

1. Stáhnout stránky starého carrom.cz do složky (jeden soubor na adresu, `/` nahrazeno `__`),
   seznam adres je v mapě webu `pages.csv` (pomalu, ~1 požadavek za sekundu, starý hosting vrací 429).
2. `python3 -I tools/import/oldsite_parse.py <složka> > pages.json`
3. `python3 -I tools/import/oldsite_import.py pages.json player_spellings.csv [--dry]`

Import zapíše ročníky (`data/editions`), tabulky MČR (`data/rankings`), nové hráče (`data/players`)
a mapu starých adres (`data/redirects.yaml`). Existující soubory s výsledky nepřepisuje.
Sloučení jmen hráčů řídí `player_spellings.csv` (rozhodnutí Ondřeje z listopadu 2026).
