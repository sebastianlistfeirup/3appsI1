# L10 — Forklar det enkelte udfald

Udført 2026-10-16. Bygger videre på L09.

## Leveret

- Sagsudforsker i Resultater: søgning i id/sagstype, statusfilter, 20 sager pr. side, begge sagers udfald og køtid. Genberegn faktisk hændelsesforløb for valgte sag via separat worker; afbryd og skift sag sikkert.
- Begge scenariers faktiske tidsregnskab: kø, aktivt arbejde, planlagt vent og kalenderpause. Uafsluttede udfald fremstår som censurerede; fraværende modparter vises eksplicit. Genberegning skal matche den gemte første seeds sag, før beviset vises.
- Faktiske hændelser med trinnavne/besøg, pagineret ved 100; arbejdsintervaller og eksport af begge fulde input+seed+evidens som reel JSON.
- Korte simulationsperioders kødiagram bruger nu ms/sekunder/minutter/timer, så en 5-minutters model ikke får fem etiketter med `0 t`. Køaksen bruger forskellige heltal.
- Motor `flow-des/1.3.0`, PRNG `mulberry32-fnv1a/2`: rettet kolliderende Unicode-strømme og tvetydige kolon-sammenkædede visit-id’er. Alle tidligere ASCII-golden-sekvenser er bevaret. Filtreret evidens ændrer ingen global konkurrence, KPI, ressourceudnyttelse, køsample eller sagsresultat.

## Verificeret

- 84 enhedstests på 9 filer, begge berørte typechecks og produktionbuild grønne.
- 60 deterministiske differentialmodeller mod den tidligere fulde motor: samme resultater efter dokumenteret normalisering af visit-id-format og den tidligere censureringsrettelse. PRNG importeres i begge fra aktuel version; separat Unicode-fixture beviser den tilsigtede PRNG-ændring. 100.000 samtidige 1-ms-sager er konservativt afsluttet på 2,44 sekunder.
- Benchmark 20 noder / 18 puljer / 10.000 sager × 30 replikationer: 17.078.131 hændelser, 36,362 sekunder samlet, 1,212 sekunder i gennemsnit, 616.332 KiB maksimal RSS på den registrerede AMD/Node24-maskine. En produktionsbuild kørte samtidig med benchmarkets første replikationer; målingen er ikke en isoleret hastighedsgaranti.
- `pnpm exec tsx apps/flowlab/tests/case-evidence-check.ts` i Chromium/Firefox/WebKit, desktop 1440×900, tablet 1024×768, mobil 390×844: eksakte golden-tider, rigtig JSON, fælles første seed, kort tidsakse, tom søgning, afbrydelse, sene workersvar og kalenderpause/censurering. Axe WCAG2A/AA/21AA: 0 fund; ingen browserfejl/viewportoverflow. Skriftstørrelser og mobile tabelhint efterset visuelt.
- Bevisfiler: `reports/flowlab/*-case-evidence-check.json`, `*-case-evidence.json`, `*-case-explorer.png`, `engine-tests.txt`, `engine-audit.json`, `benchmark-30.json`.

## Grænser

Enkeltsager er fra første seed og er ikke et estimat af hele forsøgets effekt. Den globale sammenligning bruger fortsat 30 parrede kørsler. Hændelses- og arbejdsintervalspor har grænser med eksplicit diagnostik; ingen skjult udfyldning. Ingen cloud-/kundedatakobling.
