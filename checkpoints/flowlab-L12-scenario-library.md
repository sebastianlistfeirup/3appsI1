# L12 — Flere idéer i samme arbejdsrum

Udført 2026-10-16. Bygger videre på L11.

## Leveret

- Søgbar scenariesamling på scenariesiden med hver gemt idé, hypotese, baseline, ressourcekapacitet og fælles seed. Et snapshot kan åbnes som arbejdsudkast og beregnes igen.
- Før et gemt scenarie åbnes, en ny skabelon vælges eller et nyt alternativ kopieres fra baseline, gemmes et ændret udkast automatisk som en selvstændig version. Allerede gemte udkast giver ingen dublet.
- Skabelonskift bevarer datagrundlag, datahistorik, tidligere scenarier, seed og beslutningskladde. Datamålinger bliver ikke automatisk genfortolket som aktuelle for en anden model.
- Ved 30 gemte snapshots blokerer en ny gemning eller et skift, der kræver sikkerhedskopi. Ingen ældre idé bliver længere fjernet automatisk. Modelbiblioteket tilbyder eksplicit oprydning efter sikkerhedskopi.
- Import af arbejdsrum afviser gentagne modelversions-id'er, så åbning af en version aldrig bliver tvetydig.

## Verifikation

- 91 enhedstests på 11 filer; berørt typecheck og produktionbuild grønne. Nye fixtures afstemmer gemte modeller og eksakte hypoteser/seeds, skabelonskift med datahistorik, eksport/import, fuld versionsgrænse og dublerede ids.
- `pnpm exec tsx apps/flowlab/tests/scenario-library-check.ts` består i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Forløbene åbner, ændrer, genindlæser, kopierer, gemmer og eksporterer flere faktiske scenarier. Rigtige backupfiler indeholder begge dataversioner og alle forventede snapshots.
- Et separat fuldt bibliotek beviser, at hverken gemning eller et risikofyldt skift sletter nogen af de 30 versioner. Efter eksplicit sletning af Version 1 kan Version 31 gemmes.
- Axe WCAG2A/AA/21AA: 0 fund. Ingen browserfejl eller viewportoverflow. Desktop og mobil er visuelt inspiceret.
- Beviser: `reports/flowlab/*-scenario-library-check.json`, `*-scenario-library.png`, `*-scenario-workspace.json`, `engine-tests.txt`. Det eksisterende journey-forløb består fortsat alle 9 checks efter opdatering af den forældede stale-tekstselector.

## Grænser

Biblioteket gemmer model- og forsøgssnapshots lokalt i samme arbejdsrum, højst 30 / 16 MB. Beregningsresultater genskabes fra modellens input og seed ved åbning; et kort viser derfor ingen opdigtede eller historisk misvisende nøgletal. Beslutningskladden tilhører arbejdsrummet og ændres ikke ved skift af idé.
