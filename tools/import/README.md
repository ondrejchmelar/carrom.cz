# Import ze starého webu (jednorázový)

1. Stáhnout stránky starého carrom.cz do složky (jeden soubor na adresu, `/` nahrazeno `__`),
   seznam adres je v mapě webu `pages.csv` (pomalu, ~1 požadavek za sekundu, starý hosting vrací 429).
2. `python3 -I tools/import/oldsite_parse.py <složka> > pages.json`
3. `python3 -I tools/import/oldsite_import.py pages.json player_spellings.csv [--dry]`

Import zapíše ročníky (`data/editions`), tabulky MČR (`data/rankings`), nové hráče (`data/players`)
a mapu starých adres (`data/redirects.yaml`). Existující soubory s výsledky nepřepisuje.
Sloučení jmen hráčů řídí `player_spellings.csv` (rozhodnutí Ondřeje z listopadu 2026).

# Import výsledků ze SoL (po každém turnaji)

`pip install requests` a pak:

```
python3 tools/import/sol.py https://sol5.metapensiero.it/lit/tourney/<id>        # jeden turnaj
python3 tools/import/sol.py https://sol5.metapensiero.it/lit/championship/<id>   # celý seriál MČR
```

- Turnaj se zapíše do ročníku se stejným `start_date` (jiný ročník: `--edition cocp/2027`). Ročník musí
  v adminu existovat. Ročníky, které už výsledky mají, přeskočí (přepíše `--force`). `--dry-run` nic nezapíše.
- Hráče pozná podle pole `sol` (ID v SoL), pak podle jména, přezdívky a `spellings`. Nového hráče z ČR založí
  s `mcr: true`. Hráče ze zahraničí bez vlastní stránky zapíše jen jménem a státem.
- V GitHubu: Actions → „Import ze SoL“ → Run workflow, vlož odkaz. Workflow otevře pull request s výpisem.
- Výpis (nebo `--report soubor.md`) ukazuje odhadnuté shody jmen a nové hráče. Ty zkontroluj před commitem.
- SoL lit chrání kontrola proti robotům (Anubis). Skript ji vyřeší výpočtem, představí se v User-Agent
  a mezi požadavky čeká 1,5 s.
