# L26 — PRNG-version er også en forudsætning for nyt bevis

Udført 2026-10-17 som afsluttende kontraktaudit. Simulationsalgoritme, motorversion og PRNG-algoritme ændres ikke.

## Konkret fejl og rettelse

En faktisk 30-seed-golden-sammenligning blev ændret i én kørsels `prngVersion` til `unknown-prng`. Den tidligere `assertReportReady` accepterede stadig rapporten, og `assessHoldout` returnerede `target_met`. Reproduktionen er gemt i `reports/flowlab/prng-mismatch-reproduction.json`.

- Sammenligning, rapportklarhed og ny holdout kræver nu både den låste motorversion og PRNG-version på hver kørsel i begge modeller. En fejl i det sidste seedpar afvises også.
- Appen bevarer et inkompatibelt historisk resultat læsbart, men markerer det uaktuelt, blokerer ny aktuel rapport og forklarer, hvorfor ny holdout kræver genberegning.
- Sagsforløb kan ikke afspilles med en anden motor-/PRNG-kontrakt. Både UI og den faktiske browserworker kontrollerer versionerne. En frisk sammenligning gør rapport og hændelsesforløb tilgængelige igen.
- De offentlige motorinput og resultattyper ændres ikke. Kun appens interne case-workerbesked får PRNG-versionerne for det første par; serverjobkontrakten er uændret.

## Verifikation

145 motor-/apptests i 23 filer, typecheck og produktionsbuild. Nye regressioner afviser ændret PRNG i baseline og alternativ, i 30. replikation, i rapport og holdout. Historisk lagringsschema bevarer resultaterne, og ægte genberegning gør dem aktuelle igen.

`prng-version-check.ts`: Chromium, Firefox og WebKit ved desktop/tablet/mobil. Browserens virkelige første 30-parskørsel gemmes i IndexedDB; testen ændrer kun provenancefeltet på én kørsel, ikke dens målinger. Efter genindlæsning bevares resultatet, mens rapport, holdout og replay blokeres. En faktisk worker-genberegning genskaber præcis samme målinger, 30 fælles seeds og korrekte versioner i downloadet rapport og hændelses-JSON. Axe: 0; browserfejl: 0; ingen dokumentoverflow.

Beviser: `prng-mismatch-reproduction.json`, `*-prng-version-check.json`, `*-prng-version.png`, `engine-tests.txt`. Eksisterende sagsforløb kontrollerer fortsat nøjagtige golden-tider, kalenderpauser, cancel og races.

## Yderligere konkrete fund i samme gate

`assertReportReady` accepterede også en rapport med statusmærket `completed`, 30 faktiske seeds og en ønsket plan på 31 seeds. Den genberegnede sammenligningsstatus skal nu selv være `completed`; UI kontrollerer desuden, at antal, rækkefølge og seeds stemmer mellem plan og begge resultatlister. Reproduktion: `incomplete-seed-plan-reproduction.json`. Dette er en valideringsrettelse, ikke en ændring af beregnede tal.

Den nye Firefox-genindlæsningsprøve fandt, at browseren kunne genoprette eksportknappens tidligere enabled-state, selv om det indlæste resultat var uaktuelt. Selve rapportfunktionen afviste fortsat resultatet. Knappen frabeder sig nu denne Firefox-formularhistorik med `autocomplete=off`; den rigtige disabled-state efter genindlæsning er del af browsergaten. Den oprindelige observation ligger i `firefox-desktop-prng-failure.txt` og skærmbilledet med samme navn.
