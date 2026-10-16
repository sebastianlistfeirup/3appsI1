# L14 — P90, observationer og planlagt vent

Udført 2026-10-16. Bygger videre på L13.

## Leveret

- Resultater viser nu median, interpoleret p90 og præcist antal afsluttede sager for et valgfrit fælles seed. Restkø og dens aktive/ventende/planlagte del vises ved siden af tidsmålingen, så en lav tid blandt få afsluttede sager ikke skjuler censurering.
- Vent i aktivitetskø og planlagt vent er adskilte mål. Tider under et minut vises med sekunder eller millisekunder i det nye panel; manglende målinger bliver aldrig vist som nul.
- Der er en konkret forklaring af p90, små observationsgrundlag og forskellen på per-case-percentiler og variation mellem kørsler. Det eksisterende overblik mærker nu eksplicit, at gennemløbstid er middel af kørslernes medianer.
- Download af tidstal indeholder alle tre tidsarter × begge scenarier × samtlige seeds med mean/median/p90/count og millisekundsenhed, afledt af rigtige run-metrics. Samme CSV følger automatisk rapportpakken.
- PDF har en særskilt tidsprofilside med middel af hver kørsels tidsmål, min–maks antal afsluttede sager og antal tilgængelige kørsler. Den udlægger ikke middel af p90 som en samlet p90 for alle sager.

## Verifikation

- 95 FlowLab-/motortests på 12 filer; typecheck og produktionbuild grønne.
- Eksakte fixtures: golden median 120.000 ms, p90 144.000 ms, n=3; to ressourcer giver p90 90.000 ms. Et 30.000 ms vent-trin og 200.000 ms horisont viser én afsluttet og to uafsluttede sager i baseline; én af de to er i planlagt vent. Nul kapacitet giver manglende tider med n=0, mens den kendte baseline bevares.
- `time-profile-check.ts` består Chromium/Firefox/WebKit ved desktop1440×900, tablet1024×768 og mobil390×844. Virkeligt seedvalg, samtlige 180 CSV-rækker afstemt mod JSON og rapportpakke, konkrete golden-PDF-tal, planlagt vent, censurering og manglende udfald. Axe WCAG2A/AA/21AA: 0 fund; ingen browserfejl/viewportoverflow.
- Udvidet PDF-layoutgate: 9 sider / 791 udtrukne ord; alle ord ligger inden for printområdet. Fuld 4.000-tegns hypotese og næsten 10.000-tegns beslutning bevares. Desktop, mobil og PDF-side visuelt inspiceret.
- Beviser: `reports/flowlab/*-time-profile-check.json`, `*-time-profile.png`, `*-time-profile.pdf`, `*-time-summaries.csv`, `time-profile-pdf-page.png`, `report-layout-check.json`, `engine-tests.txt`.

Ingen motorberegning eller simulationsversion er ændret. P90 er en beskrivende interpoleret percentil af afsluttede sagers tider, ikke en garanti om virkelighedens serviceniveau.
