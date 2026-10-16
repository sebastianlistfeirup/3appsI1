# L15 — Fælles forsøgsrammer og endelige beløb

Udført 2026-10-16. Bygger videre på L14.

## Leveret

- Scenarier har et samlet panel til simulationshorisont, målestart/opvarmning, hændelsesloft og hver models faste automationsomkostning. Et lokalt udkast valideres før begge modeller ændres samlet. Fortryd/gentag, genindlæsning og den eksisterende gate for forældede resultater følger med.
- Forklaringen skelner mellem målevinduets afslutninger, sagens fulde gennemløbstid, simuleringens stop og omkostning for hele perioden. Hændelsesloftet kan afprøves direkte og giver en rigtig partial-eksport, aldrig en komplet beslutningsrapport.
- Kilden viser nu det korrekte begreb »Forventede nye ankomster i perioden« og tillader at sætte loft for nye Poisson-sager. Simulationshorisontens input tillader motorens grænse på 365 døgn.
- Motorens faste automationsomkostning er begrænset til 1.000.000.000.000 kr. pr. kørsel. Før rettelsen blev `1e308` accepteret, hvorefter middel af 30 omkostninger blev `Infinity` og dermed `null` i JSON. Nu afvises det før simulering/import. Den maksimalt accepterede værdi er afprøvet med 30 kørsler og forbliver endelig. Store beløb får læsbar mia.-enhed i UI/PDF, mens JSON/CSV bevarer tallet.
- Rettet en import-race: import før det første demo-resultat betød `comparison: undefined → undefined`, så auto-run-effektens gamle dependency ikke udløste den lovede genberegning. Effekten følger nu dokumentet; ref-vagten holder almindelige redigeringer fri af gentagne automatiske kørsler.

## Verifikation

- 98 FlowLab-/motortests på 13 filer grønne, typecheck og produktionbuild grønne.
- Golden med målestart 120.000 ms og stop 300.000 ms: baseline afslutter to sager i målevinduet og én før; median 135.000 ms, p90 147.000 ms. Faste beløb 100/250 kr. giver samlede omkostninger 105/260 kr. ved kapacitet 1/2. Eksakte tal er afstemt i den virkelige browserdownload.
- `experiment-settings-check.ts` består Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Hver kørsel holder kun den første worker-request tilbage for deterministisk at importere før det første resultat; alle importerede resultater beregnes af den rigtige worker.
- Samme gate afprøver ugyldige udkast, fælles anvendelse, undo/redo, reload, hændelsesloft 1, partial JSON med 1 af 30 par, genetablering af beregningsbudget, stort beløb i rigtig PDF/JSON, Poisson-loftets persistens og axe WCAG2A/AA/21AA. 0 tilgængelighedsfund, browserfejl eller viewportoverflow. Desktop og mobilpanel visuelt inspiceret.
- PDF-layoutgaten har 9 sider / 791 ord uden ord uden for printområdet.
- Beviser: `reports/flowlab/*-experiment-settings-check.json`, `*-experiment-settings.png`, `*-experiment-frame.json`, `*-large-cost.pdf`, `engine-tests.txt`, `report-layout-check.json`.

Ingen ændring i simulationsaritmetik, eventorden eller PRNG. Motorversionen er fortsat 1.3.0; dette indsnævrer inputkontrakten for et tidligere ubegrænset beløb. Der foretages ikke automatisk fordelingsnøgle, amortisering eller diskontering af det faste beløb.
