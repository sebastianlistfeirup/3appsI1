# L24 — Sikker indtastning og brugbare store arbejdsplaner

Udført 2026-10-17 efter L23a. Motoren ændres ikke.

## Konkrete rettelser

Den tidligere hurtigeditor ændrede en tømt medarbejderværdi fra 4 til 0 og en tømt horisont fra 8 timer til 1 ms. Reproduktionen fra den gamle produktionsbuild ligger i `reports/flowlab/inspector-empty-field-reproduction.json`.

- Navne, sagstyper, tider, kapacitet, priser, ankomstlofter, genbesøg og sandsynligheder redigeres nu i en feltkladde. Enter eller blur anvender én gyldig ændring. Escape annullerer. Ingen mellemtilstand sendes til modellen for hvert tastetryk.
- Tom, negativ, for stor eller ikke-heltallig kapacitet afvises. Et eksplicit nul bevares, hvor nul er tilladt. Ugyldig blur gendanner den tidligere modelværdi med en forklaring; input erstattes ikke med et skjult minimum, maksimum eller standardnavn.
- Tider bruger samme præcise decimal-/millisekundkontrakt som varighedseditoren. Simulationsstop skal være efter målestart. Nye sager og startkø valideres mod det fælles loft på 100.000. Navne kræver 1–100 tegn uden kontroltegn.
- Forventede Poisson-ankomster er en afledt brøk, som ikke længere afrundes til nul. Ændret horisont opdaterer feltet uden at ændre det underliggende interval. Ankomstloftet er stadig særskilt fra ankomstintensiteten.
- Plus/minus bruger den netop anvendte indtastning. Fx indtast 5 og klik plus → 6; undo kan gendanne først 5 og derefter den forrige værdi. Baseline/alternativ og skift af node har separate kladder.
- En uanvendt kladde aktiverer browserens advarsel før siden forlades. Et sent arbejdsrumsimport-svar må ikke overskrive en indtastning, der begyndte efter importen. Dette kontrolleres med en separat inputrevision, selv før modellen er ændret.
- Inspectoren viser højst tre kalenderintervaller og åbner den eksisterende paginerede ressourceeditor til fuld redigering. En model med 1.000 intervaller kræver derfor ikke 2.000 inline-inputs. Alle intervaller og referencer bevares.
- Labels er knyttet eksplicit til input; plus/minus ligger uden for inputlabelen. På telefon bruger hurtigfelterne fuld bredde, så fejlbeskeder kan læses, og et felt ikke flytter sine knapper mellem pointerdown og pointerup, når kladdeteksten forsvinder.

## Verifikation

- 136 Flow-/motortests i 22 filer; typecheck og produktionsbuild grønne. De fem nye domænetests dækker ægte nul vs. tomt felt, budgetter/heltal, 1 ms/365 døgn, målestart, Poisson-forventning og navne.
- `inspector-input-check.ts`: Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Kontrollerer ugyldig kladde, en indtastning med flere tegn som ét undo, plus efter blur, scenarieskift, decimalkomma, målestart, fælles sagsbudget, præcis 1 ms SLA, faktisk 30-seed-kørsel, downloadet arbejdsrum og genindlæsning efter bekræftet lagring.
- En rigtig beforeunload-dialog i Chromium afviser navigation og bevarer den uanvendte kladde. Store kalendere vises begrænset i Inspector og komplet i ressourceeditoren.
- Axe WCAG2A/AA/21AA: 0; browserfejl: 0; ingen vandret dokumentoverflow. Desktop/tablet/mobil er visuelt inspiceret. Skærmbilleder viser en reel afvist indtastning med den gamle modelværdi bevaret.
- Berørte eksisterende workspace-/datahistorikforløb køres i alle tre browsere. De bevarer import-/cancel-/revisionbeskyttelse, bekræftet lagring, holdout-kildedata, undo og blokering af rapport på ændret model. Journey kontrollerer fortsat den faktiske kapacitetsændring; den sender nu Enter før den forventer et ændret modelresultat.

Beviser: `reports/flowlab/*-inspector-input-check.json`, `*-inspector-input.png`, `inspector-empty-field-reproduction.json`, `workspace-*.json`, `*-data-history-check.json`, `journey-check.json`, `engine-tests.txt`.

Afgrænsning: en feltkladde gemmes ikke som en modelversion. Ved gyldig blur anvendes den; ved ugyldig blur bevares den tidligere model med en synlig forklaring. Dropdownvalg er stadig umiddelbare. Ressource-, ankomst-, varigheds- og forsøgsdialogerne bevarer deres eksisterende samlede anvendelse.
