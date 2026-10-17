# L24a — Faktisk touch afslutter kladden før næste handling

Udført 2026-10-17 efter L24. Ingen motorændring.

## Reproduceret fejl

Den almindelige mobilviewport-test brugte museklik. En ekstra kontrol med `hasTouch: true` og Playwrights faktiske `tap()` fandt, at Firefox kan aktivere en knap uden at flytte fokus fra inputfeltet. Fra modelværdi 20, feltkladde 5 og tap på plus blev resultatet derfor 21, fordi `blur` endnu ikke havde anvendt 5. Fejlen er bevaret fra den tidligere produktionsbuild i `reports/flowlab/firefox-touch-reproduction.txt`.

## Rettelse

Appens pointerdown-capture afslutter et aktivt Inspector-felt, når der trykkes uden for feltet. Den eksisterende validerede blur-handling anvender den gyldige kladde før den efterfølgende knaphandling; ugyldig kladde gendanner den tidligere værdi. Dette omfatter plus/minus, scenarieskift, lukning, navigation og beregning. Tryk i selve inputfeltet bevarer normal tekstmarkering. Ingen preventDefault, kunstig forsinkelse eller særskilt modelmutation er tilføjet.

## Verifikation

- Produktionsbuild og app-typecheck er grønne.
- `touch-edit-check.mjs` er kørt med faktiske touch-events i Chromium, Firefox og WebKit, 390×844. Chromium/WebKit bruger desuden `isMobile`; Firefox understøtter ikke denne emuleringsindstilling, hvilket er eksplicit registreret.
- Gyldig 5 efterfølges af plus → 6 og minus → 4; to undo gendanner først 5, så 20. Tastaturens Tab + Space bevarer samme kontrakt.
- Touch-skift mellem baseline/alternativ anvender kladden på den korrekte model. Ugyldig tom kladde efterfulgt af plus starter fra tidligere gyldig værdi. Luk/genåbn bevarer både tal og nodenavn. Varighedsmodal kan åbnes og annulleres.
- Kør sammenligning trykkes, mens 6 stadig er en uanvendt kladde. Den downloadede faktiske rapportpakke indeholder kapacitet 6, det nye nodenavn og 30 parrede seeds.
- Den eksisterende Inspector-gate gentages i alle tre browsere ved desktop/tablet/mobil; validering, undo, beforeunload, importrevision, 1 ms, store kalendere, lagring og eksport bevares. Axe: 0. Browserfejl: 0.

Beviser: `reports/flowlab/*-touch-edit-check.json`, `firefox-touch-reproduction.txt`, `*-inspector-input-check.json` og `*-inspector-input.png`.
