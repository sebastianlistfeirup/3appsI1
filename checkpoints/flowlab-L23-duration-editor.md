# L23 — Præcise, samlede varighedsændringer

Udført 2026-10-17 efter L22. Simulationsmotor og deterministiske strømme er uændrede.

## Konkret fejl

Den gamle Inspector viste varighed i minutter afrundet til tre decimaler. En importeret 1 ms stod derfor som `0`, og et tømt felt blev straks normaliseret til 1 ms i modellen. Reproduktionen fra den gamle produktionsbuild ligger i `reports/flowlab/duration-edit-reproduction.json`.

## Leveret

- Aktivitet og planlagt vent har en læsbar, præcis varighedsoversigt og **Rediger varighed**. Dialogen redigerer fast, trekantet eller eksponentiel fordeling i en lokal kladde. Ingen felter når modellen før én samlet, gyldig anvendelse.
- Fire enheder: millisekunder, sekunder, minutter, timer. 1 ms vises som 1 ms. Enhedsskift bevarer den kanoniske tid, også mellem millisekunder og en brøkdel af en time. Ufærdige felter i en inaktiv fordeling bevares til senere rettelse.
- Decimaler med komma eller punktum accepteres. Decimalheltalsregning kontrollerer grænser før afrunding, inklusive ekstremt små overskridelser. Halve millisekunder rundes op, synligt i dialogen. Tomme/negative/for store tal afvises; de erstattes aldrig med en minimumsværdi.
- Trekanten kontrolleres samlet, så minimum/typisk/maksimum kan ændres uden at offentliggøre en ugyldig mellemtilstand. Teoretisk gennemsnit vises med præcise ms-parametre og beskrives som en antagelse før trækning/afrunding. Eksponentiel tid beskrives med sit manglende faste loft.
- Annuller, krydset og Escape bevarer modellen og returnerer fokus. Anvendelse er én undo/redo-hændelse og gør tidligere resultater historiske. Kalenderpauser, én ressourceenhed og ressourcefri planlagt vent forklares.
- Brugervejledning og særskilt `docs/flowlab-durations.md` beskriver arbejdsgangen og dens konkrete begrænsninger.

## Verificeret

- 131 Flow-/motortests i 21 filer, typecheck og produktionsbuild grønne. Nye domænetests dækker 1 ms/365 døgn i alle enheder, eksakte decimalgrænser, halve ms, samlet trekant, inaktive kladdefelter og faktisk simulering med den anvendte varighed.
- `duration-editor-check.ts` kørt i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844: præcis 1 ms, fire enheder, ugyldig/overstor/tom kladde, annullering, decimal-komma, afrundingsforklaring, trekantens orden, én undo/redo, reel 30-seed-kørsel, faktisk arbejdsrumseksport og genindlæsning efter bekræftet lagring.
- Dialog/fokus/Escape, eksponentiel forklaring, responsive grænser og axe WCAG2A/AA/21AA kontrolleret. Ingen violations eller browserfejl. Alle tre størrelser visuelt inspiceret; på små skærme kan dialogen scrolles til forhåndsvisning og handlinger.
- Eksisterende `journey-check.mjs` består, inklusive CSV-median 15 sekunder overført til den rigtige aktivitetsfordeling. Testen åbner nu varighedsdialogen; kalibreringsadvarslen og den aktuelle model kontrolleres fortsat.

Beviser: `reports/flowlab/*-duration-editor-check.json`, `*-duration-editor.png`, `*-duration-editor-actions.png`, `duration-edit-reproduction.json`, `journey-check.json`, `engine-tests.txt`.

Afgrænsning: dette ændrer varighedsredigering. De øvrige Inspector-hurtigfelter auditeres særskilt; deres eksisterende adfærd er ikke omfattet af denne rettelse. Kladden er lokal for den åbne dialog; kun anvendte ændringer gemmes i arbejdsrummet.
