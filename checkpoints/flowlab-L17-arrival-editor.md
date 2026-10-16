# L17 — Ankomster og sagstyper uden JSON-redigering

Udført 2026-10-16. Bygger videre på L16.

## Leveret

- Ankomstnoden åbner nu en fuld dialog til Poisson eller manuel ankomstliste. Manuel tilføjelse, ændring og fjernelse foregår i en kladde; først Anvend ankomster ændrer den valgte model samlet og gør tidligere resultater forældede.
- Sags-id, sagstype og tidspunkt kan redigeres i minutter, sekunder eller millisekunder. Id'er er entydige, kontroltegn afvises, heltalstider bevares, og tider afrundes som beskrevet til nærmeste millisekund. Id'ets betydning for tilfældighedsstrømme er forklaret.
- Kladden viser antal før stop, ved/efter stop og før målestart, med en præcis forklaring af ankomst- og observationsgrænser. Sager uden for perioden slettes ikke. En ny manuel liste er tom og skaber ingen opdigtede ankomster.
- Søgbare lister har højst 20 DOM-rækker, direkte sidevalg og loft på 100.000 sager. Et eksisterende element kan stadig ændres ved loftet. Ufærdige sagsfelter kan ikke stiltiende overskrives af et klik på en anden sag eller anvendes som færdig liste.
- Poisson-kladden viser interval, nye sagers loft og startkø med fælles 100.000-grænse. Metodeskift bevarer begge lokale kladder, mens dialogen er åben; Fortryd gendanner hele anvendte ændringer.
- Dialogen styrer fokus og annullering. Globale modelgenveje for undo/redo er blokeret bag åbne dialoger, så en model ikke ændres skjult under kladden.

## Verifikation

- 104 Flow-/motortests på 15 filer, typecheck og produktionbuild grønne. Heltalstider til Number.MAX_SAFE_INTEGER roundtripper; 100.000-sagers loft, entydighed, uændrede objekter og ægte golden-beregning er afprøvet.
- `arrival-editor-check.ts` består Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Ægte import, kladder, luk/fortryd, id-konflikt, genindlæsning, 1.000-rækkers søgning/side 50, metodeskift, og fulde 30-seed-rapporter.
- Ændret ankomst b til nul giver median 150.000 ms, p90 174.000 ms og gennemsnitlig køtid 50.000 ms. En fjerde sag præcis ved stop bevares i modelpakken, men run-metrics har kun tre ankomster.
- En særskilt routingfixture ændrer kun b's sagstype til haster gennem dialogen. Motorens faktiske ressourcetidslinje viser b på fast-aktiviteten fra 90.000 til 120.000 ms; median falder fra 120.000 til 90.000 ms.
- En tom manuel liste efter Poisson giver ægte nul ankomster, nul throughput og null-median/p90 med count 0. Axe afprøves både for fyldt og tom dialog: 0 WCAG2A/AA/21AA-fund. Ingen browserfejl eller dialogoverflow.
- Desktop/tablet/mobil og formularfelter er visuelt inspiceret. `next dev` er desuden startet og den virkelige 30-pars bootstrap observeret under React StrictMode. Nexts genererede AGENTS.md er læst og bevaret; de relevante bundtede guider om client components, StrictMode og UI-state er læst.
- Beviser: `reports/flowlab/*-arrival-editor-check.json`, `*-arrival-editor.png`, `chromium-*-arrival-fields.png`, `engine-tests.txt`. Brugsvejledning: `docs/flowlab-arrivals.md`.

Ingen ændring i motorberegning, PRNG eller evidensmærkning. Manuel indtastning udgør en modelantagelse og bliver ikke til CSV-proveniens eller en ny kalibreringsgodkendelse.
