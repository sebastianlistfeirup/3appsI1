# L22 — SLA for både afsluttede sager og restkø

Udført 2026-10-17 efter L21. Simulationsmotoren er uændret; visning og eksport bruger dens faktiske resultater.

## Leveret

- En særskilt SLA-visning sammenligner afslutninger inden/efter grænsen, uafsluttede sager med kendt brud og sager med ukendt endeligt udfald. Afbrudte sager står separat. Vælg gennemsnit eller et konkret fælles seed.
- Ingen afslutninger giver ukendt SLA-andel, aldrig en opdigtet 0 eller 100 %. Antallet af kørsler med en kendt andel vises. Gennemsnittet af kørslernes andele er tydeligt adskilt fra en samlet andel af alle sager.
- Begge modellers SLA-grænser vises. Forskellige grænser forklares og angives præcist i millisekunder. En sag præcis på grænsen er rettidig, hvis afsluttet; ellers er dens endelige udfald stadig ukendt.
- `sla.csv` kan hentes direkte og indgår i rapportpakken med alle 60 seed-/modelrækker. Manglende andele og manglende kørsler bliver tomme felter, ikke nul. Enheder og kohorter er dokumenteret.
- PDF får en selvstændig SLA-side med samme syv antal, kendte andele og grænser. Tids- og omkostningssiderne bevarer deres placering. Lange ressourcelister/tekster får fortsat flere sider.
- `docs/flowlab.md` er en samlet dansk brugervejledning: første forsøg, editor, tid, ressourcer, usikkerhed, data/holdout, snapshots, sikkerhedskopi, eksport, fejl og reelle grænser. Den beskriver browserens lokale standardprofil præcist og lover ingen tilkoblet cloudknap. `docs/flowlab-sla.md` beskriver SLA-kontrakten og det numeriske eksempel.
- Ressourcetælleren siger nu `1 ressourcepulje` / `2 ressourcepuljer`; sag- og puljetællere er tilsvarende rettet. En færdig beregning siger nu, at resultatet gemmes lokalt; topbaren afgør fortsat, om lagringen faktisk er bekræftet.

## Verificeret

- 126 domænetests i 20 filer, typecheck og produktionsbuild grønne. Nye testtilfælde dækker nul afslutninger, tom periode, grænsens lighed, kalenderpause/planlagt vent, målestart, forskellige grænser, manglende kørsler, omarrangerede seedrækker og varierede faktiske Poisson-kørsler.
- `sla-profile-check.ts` er kørt i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Den beregner 30 rigtige seedpar, vælger sidste seed, downloader CSV og rapport-ZIP og afstemmer PDF-side 5 med skærm og CSV. Forskellige grænser og en tom periode kontrolleres også. Axe WCAG2A/AA/21AA: 0; browserfejl: 0; ingen dokumentoverflow.
- Konkrete tal: horisont 200.000 ms, SLA 100.000 ms. Baseline afslutter 2 sager, heraf 1 rettidig; 1 sag er uafsluttet og endnu ukendt. Alternativ uden kapacitet afslutter 0; 3 sager er uafsluttede, heraf 2 allerede over SLA og 1 ukendt. Andele er 50 % henholdsvis ukendt.
- Efter de sidste ental/flertal-ændringer er Chromium SLA-gaten gentaget samt de eksisterende omkostnings- og tidsgates. Desktop, tablet, mobil og den genererede PDF-side er visuelt inspiceret.
- PDF-stresstesten omfatter 100 forskellige puljer, prislofter, lange tekster og SLA fra 1 ms til 365 døgn. Den faktiske PDF har 25 sider og 3.264 målte ord; ingen ord går uden for siden.

Beviser: `reports/flowlab/*-sla-profile-check.json`, `*-sla-profile.png`, `*-sla-report.pdf`, `*-sla.csv`, `sla-pdf-page.png`, `report-layout-check.json`, `report-long-content.pdf`, `*-cost-profile-check.json`, `*-time-profile-check.json` og `engine-tests.txt`.

Afgrænsning: SLA-andelen beskriver afsluttede sager i målevinduet; restkøen beskriver alle ankomne, uafsluttede sager ved stop, også fra før målestart. UI/PDF afrunder, mens CSV/JSON bevarer tal. Der udledes ingen endelig servicegrad for uafsluttede sager og ingen automatisk beslutning.
