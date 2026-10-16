# L11 — Alle parrede udfald

Udført 2026-10-16. Bygger videre på L10.

## Leveret

- Resultater viser nu en interaktiv fordeling af faktiske forskelle for alle syv målinger. Søjler tæller konkrete seedpar; klik eller tastatur vælger et interval med præcise grænser og de tilhørende seeds.
- Brugeren kan undersøge baseline, alternativ og forskel for hvert seed, se samtlige par i en tabel og eksportere rigtige CSV-tal med seed, metric, enhed og fulde værdier.
- 10./50./90.-percentiler følger motorens definition. Optælling af lavere/uændrede/højere målinger giver ingen automatisk påstand om gevinst; særlig høj udnyttelse er ikke i sig selv bedre.
- Konstante resultater vises som én virkelig søjle. Manglende målinger vises særskilt, beholder den kendte modpart og indgår hverken som nul eller i fordelingens denominator.
- Negative/positive forskelle og modellens begrænsning forklares i UI. Spredningen udlægges hverken som et konfidensinterval eller som sandsynlighed for en virkelig gevinst.

## Verifikation

- 86 enhedstests på 10 filer og berørt typecheck / produktionbuild grønne. Domain-fixtures matcher seedpar efter seed-id, uafhængigt af arraysortering, afstemmer alle histogrammedlemmer og sammenligner percentiler med motorens eksisterende resultat.
- `pnpm exec tsx apps/flowlab/tests/run-distribution-check.ts` på Chromium/Firefox/WebKit med 1440×900, 1024×768, 390×844: faktisk medlemsserviceberegning, eksakte optællinger og percentiler, tastaturvalg, alle syv målinger, rigtig CSV med units, konstant golden-forskel og et alternativ uden afsluttede sager. Axe WCAG2A/AA/21AA: 0 fund; ingen browserfejl/viewportoverflow.
- Skærmbilleder visuelt gennemgået for læsbarhed og mobil layout. Beviser: `reports/flowlab/*-run-distribution-check.json`, `*-run-distribution.png`, `*-paired-runs.csv`, `engine-tests.txt`.

## Grænser

Søjleinddeling er en oversigt over de 30 registrerede forskelle, ikke en tilpasset statistisk tæthed. UI afrunder tal; CSV bevarer fuld numerisk præcision og enhed. Den valgte målings CSV indeholder alle seedpar, selv når en bestemt søjle er valgt.
