# L20 — Tre gennemprøvede eksempler på andre mekanismer

Udført 2026-10-16 efter L19. Ingen ændring af motorens algoritme eller version.

## Leveret

- Forsiden tilbyder sagstyper og delte teams, ansøgninger med genarbejde samt en arbejdsdag med pause. Hver skabelon beskriver syntetiske antagelser, den konkrete ændring og den faldgrube, som resultaterne skal vurderes imod. Den oprindelige medlemsskabelon er fortsat tilgængelig.
- Modellerne indeholder rigtige manuelle ankomster, typebestemt routing, fælles eller separate puljer, vægtet genarbejde med trekantsfordelt aktivitet, planlagt vent og pauser i ressourcekalenderen. Der vises ingen fabrikerede resultater; de normale 30 fælles seeds beregnes ved åbning.
- Åbning arkiverer en ændret kladde gennem den eksisterende scenariebeskyttelse. Beslutningstekst, baseseed og datagrundlag bevares. Skabelonvalg kan fortrydes, gentages og genåbnes efter varig lokal lagring.
- Hypotesen i modelvisningen følger nu den faktiske scenarietekst. Ressourcegrafen bevarer baseline-navnet og viser det alternative navn særskilt, når samme pulje-id er omdøbt.
- `docs/flowlab-templates.md` beskriver inddata, fortolkning og forventede udfald. Den angiver også, at en antaget lavere fejlrate ikke dokumenterer en virkelig indsats eller dens pris.

## Verificeret

- 119 Flow-/motortests i 18 filer; typecheck og produktionsbuild grønne.
- Sagstyper: alle 30 seeds giver baseline 11 afsluttede, 1 rest, median 35 minutter og 1.140 kr.; separat bemanding giver 9 afsluttede, 3 rester, median 10 minutter og samme pris. De tre rester er komplekse sager. Den tilsyneladende bedre median skyldes altså også, hvilke sager der når at blive færdige.
- Kalender: baseline afslutter efter 90/180/330/420 minutter; den tidligere pause giver 90/240/330/420. Medianen stiger fra 165 til 195 minutter, mens gennemsnitlig køtid, antal afsluttede og løn er uændrede. Reserveret tid er 420 minutter, faktisk optaget tid 360 minutter og løn 1.995 kr.
- Genarbejde: 20 unikke ankomster, gentagne aktivitetsbesøg koster igen, og planlagt vent optager ingen medarbejder. Med standardseed-listen er de samlede variable priser over 30 kørsler 4.200 kr. og 3.325 kr.; første seed har 24 og 20 aktivitetsbesøg. Der er ingen motoradvarsler.
- `templates-check.ts` er grøn i Chromium, Firefox og WebKit ved desktop/tablet/mobil. Den importerer en rigtig eksisterende kladde, åbner alle tre skabeloner, afventer fulde beregninger, downloader JSON og kontrollerer resultater og bevaret kontekst. Undo/redo og genindlæsning testes efter synligt bekræftet lokal lagring.
- Axe WCAG2A/AA/21AA: 0 overtrædelser. Browserfejl: 0. Ingen dokumentoverflow. Kataloget og routingmodellen er visuelt inspiceret ved alle tre størrelser; de to andre modeller er inspiceret på desktop. Eksisterende scenariebiblioteks- og tastaturdiagram-gates er også grønne i Chromium.

Beviser: `reports/flowlab/*-templates-check.json`, `*-templates.png`, `*-template-*-model.png`, `engine-tests.txt`, `chromium-scenario-library-check.json` og `canvas-keyboard.json`.

Afgrænsning: alle fire eksempler er syntetiske og ukalibrerede. De erstatter ikke egne målinger eller validering af kausal effekt. Bevarede data anvendes først efter brugerens eksplicitte kalibrering; skabelonåbning kobler dem ikke automatisk til det nye flow.
