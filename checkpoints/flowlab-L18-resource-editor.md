# L18 — Ressourcebudget og sikker oprydning

Udført 2026-10-16. Bygger videre på L17.

## Leveret

- Antallet af ressourcepools under værktøjslinjen åbner en samlet ressourceoversigt. Aktivitetens indstillinger har også adgang. Navn, kapacitet, timeløn, oprettelse, fjernelse og arbejdsplaner redigeres i én kladde med atomisk anvendelse, annullering og eksisterende undo/redo.
- Den planlagte løn er synlig for alle puljer, også dem uden tilknyttede trin. UI skelner udtrykkeligt mellem reserveret medarbejdertid og faktisk optaget tid. Prisoversigten bruger kun arbejdsplanens overlap med modellens observationsvindue og medregner ikke variable aktivitetspriser eller fast automation.
- En pulje med referencer kan ikke fjernes. Berørte trin vises. Når aktiviteter er flyttet til en anden pulje, kan den nu ubrugte pulje fjernes, uden at andre henvisninger ændres.
- Arbejdsplaner valideres samlet for intervallernes længde, overlap og grænser; sortering sker ved anvendelse. Tom arbejdsplan forklares som åben i hele perioden, og en nulstilling hedder eksplicit Nulstil til åben hele perioden. Nul kapacitet lukker puljen.
- Højst 50 puljer og 1.000 intervaller pr. pulje. Store arbejdsplaner viser 20 intervaller med direkte sidevalg. Ændringer bevares ved skift mellem sider og puljer. Det eksisterende hurtige Opret ressourcepool respekterer nu også 50-grænsen i UI.

## Verifikation

- 107 Flow-/motortests på 16 filer; typecheck og produktionbuild grønne. Eksakte enhedstests for løn i observationsvinduet, millisekundgrænser, overlap, referencebevarelse og budgetter.
- `resource-editor-check.ts` består Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Rigtige importer, modelændringer, 30-seed-JSON-rapporter, annullering/fokus, undo/redo og genindlæsning.
- Med målestart 120.000 ms og stop 300.000 ms koster den brugte pulje 5 kr. og den ubrugte pulje 30 kr. Oprydning ændrer faktisk salaryCost fra 35 til 5 kr., mens cases er identiske. Oprettelse og tilknytning af en ny pulje samt fjernelse af den gamle giver salaryCost 60 kr. og korrekt reference til den nye pulje.
- Arbejdsplan 0–60.000 ms / 120.000–200.000 ms: et 90.000 ms job afsluttes ved 150.000 ms. availableTime=140.000, busyTime=90.000, salaryCost=(140.000/3.600.000)×100. Overlap afvises før anvendelse; den anvendte plan sorteres i JSON.
- 50-puljers / 1.000-intervallers fixture: 20 kalender-DOM-rækker, direkte side 50, ændring af sidste interval til 1.999,001 min bevares efter puljeskift og reload. Oprydning af en ubrugt pulje frigør plads til en ny.
- Axe WCAG2A/AA/21AA: 0 fund; ingen browserfejl eller dialogoverflow. Desktop/tablet/mobil og kalenderfelter visuelt inspiceret. Eksisterende canvas-gate består efter det nye ressource-link.
- Beviser: `reports/flowlab/*-resource-editor-check.json`, `*-resource-editor.png`, `*-resource-calendar.png`, `engine-tests.txt`, `canvas-check.json`. Brugsvejledning: `docs/flowlab-resources.md`.

Ingen ændring i motorberegning eller version. Kladdens pris er en inputberegning for hele målevinduet. En partial-kørsel kan have en kortere faktisk måleperiode; dette ligestilles ikke med den fulde plan.
