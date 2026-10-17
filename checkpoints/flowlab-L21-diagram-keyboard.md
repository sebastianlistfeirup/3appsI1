# L21 — Læsbare tilbagekoblinger og varige tastaturændringer

Udført 2026-10-16 efter L20. Præsentation og editorhændelser ændres; simulationsmotoren er uændret.

## Leveret

- Forbindelser vælger indgang/udgang efter nodernes aktuelle placering. Genarbejdsskabelonens loop går nu ned, til venstre og op i stedet for at sno sig gennem de samme venstre/højre indgange. Retning følger også en igangværende trækning. Port-id'er er kun visningsdata og gemmes ikke i modelgrafen.
- De almindelige venstre/højre forbindelsespunkter virker fortsat til at oprette forbindelser. Ekstra portpositioner bruges kun til tegning. Kantens tilgængelige navn angiver begge noders faktiske navne og den eventuelle betingelse.
- Ankomstkortet viser Poisson-interval, loft for nye sager og startrestkø. Det påstår ikke længere et antal pr. dag for en vilkårlig simulationshorisont. Manuelle lister viser ankomster strengt før stop og særskilt antal uden for perioden.
- Varighed skelner mellem fast tid, typisk trekantstid og eksponentielt gennemsnit. Planlagt vent viser sin varighed og fortsat, at den ikke optager en ressource. Meget korte, gyldige tider vises i millisekunder, så 1 ms ikke afrundes til nul sekunder.
- Dansk tastaturhjælp og annoncering beskriver de faktiske muligheder. Forbindelser henviser til listeeditorens sletning i stedet for at love en Delete-handling, der er slået fra.

## To konkrete fejl rettet

1. React Flow 12.12 sender tastaturflytning som `position` med `dragging=false`. Den tidligere handler gemte kun `dragging===undefined`. Noden flyttede visuelt, men ændringen kom ikke i dokument/undo/IndexedDB. Handleren gemmer nu afsluttede positioner fra både mus og tastatur én gang; den dobbelte særskilte drag-stop-handler er fjernet. Enter-valg opdaterer også den valgte node i inspectoren.
2. Den kontrollerede nodeopdatering erstattede alle React Flow-felter, inklusive målte dimensioner. En valgt node blev kortvarigt `visibility:hidden`; WebKit flyttede fokus til body, så næste piletast ikke ramte noden. Opdateringen bevarer eksisterende UI-målinger, mens modeldata opdateres. ResizeObserver kan fortsat opdatere størrelse, når indholdet ændres. Den tidligere produktionsbuild er reproduceret med faktisk fokus og stil i `diagram-keyboard-reproduction.txt`.

## Verificeret

- 122 Flow-/motortests i 19 filer; typecheck og produktionsbuild grønne. Tre nye regressioner afstemmer ankomstgrænsen mod motoren, Poisson-loft plus startrestkø og fordelingernes etiketter, inklusive 1 ms.
- `diagram-routing-check.ts` i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844: reelle 30-seed-beregninger, faktisk SVG-geometri, korrekte ankomsttal og varighedsbetydning, to sammenhængende tastaturflytninger med bevaret fokus, undo/redo og genindlæsning efter bekræftet lokal lagring.
- Skabelonens seks faktiske SVG-stier måles i skærmkoordinater. Loopet går ned/venstre/op, og ingen samplede punkter krydser indersiden af et nodekort. Alle grafens oprindelige forbindelser er uændrede i den downloadede modelpakke.
- Ved desktop oprettes en ekstra forbindelse ved at trække mellem de virkelige portelementer; undo fjerner den igen. Den eksisterende canvas-gate verificerer desuden pointerflytning og tab-navigation.
- Axe WCAG2A/AA/21AA: 0. Browserfejl: 0. Ingen dokumentoverflow. Desktop/tablet/mobil er visuelt inspiceret. Telefonens standard er fortsat den læsbare listeeditor; diagrammet kan vælges og zoomes.

Beviser: `reports/flowlab/*-diagram-routing-check.json`, `*-diagram-routing.png`, `diagram-keyboard-reproduction.txt`, `canvas-keyboard.json` og `engine-tests.txt`.

Afgrænsning: dette er automatisk valg af forbindelsesside, ikke en generel algoritme til at undgå alle krydsninger i vilkårlige grafer. Nodernes koordinater er stadig brugerens modelpræsentation. Den semantiske graf og alle simulerede tal er uændrede.
