# L13 — Robust dataværksted ved filernes grænser

Udført 2026-10-16. Bygger videre på L12.

## Konkrete fund og rettelser

- Trimning skjulte rå indledende/afsluttende kontroltegn. Alle mappede felter kontrolleres nu før trimning, og ugyldige rækker får præcis record-/feltfejl. Et beskadiget event-id skaber ingen falsk dublet ved normalisering.
- Escaped quotes kunne omgå 100.000-tegnsgrænsen. Grænsen gælder nu også denne parsergren ved vilkårlige chunkgrænser.
- Den tidligere 4 KB-forhåndslæsning kunne afkorte brede kolonneoverskrifter. Formular og worker læser nu den komplette header med samme afgrænsede læser og validerer navne, længde, entydighed og kontroltegn.
- En gammel fejlslagen fillæsning kunne vise fejl efter filudskiftning. Både succes, fejl og loadingstatus kontrollerer nu den aktuelle filidentitet; afmontering invaliderer også læsningen.
- Brede CSV-filer får søgning og 20 kolonner pr. side. Mapping på andre sider bevares og forklares. Forhåndsvisninger begrænses til 240 tegn pr. celle uden at afkorte gyldige gemte værdier.

## Verifikation

- 92 FlowLab-/motortests på 11 filer; berørt typecheck og produktionbuild grønne. Ingen ændring i simulationsberegning eller motorversion.
- `csv-boundaries-check.ts`: Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Rigtig >4 KB-header, SHA-256 af originalfilen, pagination/søgning, kontroltegn, escaped quote-grænse, beskadigede headers, simuleret langsom gammel fillæsefejl og konkret downloadet renset CSV. Axe WCAG2A/AA/21AA: 0 fund; ingen browserfejl eller viewportoverflow.
- Eksisterende `import-state-check.mjs` gentaget i alle tre browsere: 15 checks pr. browser, herunder virkelig 100.000-rækkers annullering og erstatning. En reproduceret test-race ved den automatisk forsvindende toast er rettet: screenshotforberedelsen afventer nu udløb i stedet for at klikke efter en separat synlighedskontrol.
- Desktop og mobil visuelt inspiceret. Beviser: `reports/flowlab/*-csv-boundaries-check.json`, `*-csv-boundaries.png`, `*-broad-csv-quality.json`, `import-state-*.json`, `engine-tests.txt`.

Detaljeret kontrakt og grænser: `docs/flowlab-csv.md`.
