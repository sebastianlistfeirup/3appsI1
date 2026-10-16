# L16 — Læsbare inputforskelle i store modeller

Udført 2026-10-16. Bygger videre på L15.

## Leveret

- Scenariers inputdiff viser højst 20 rækker ad gangen med søgning, forrige/næste og direkte sidevalg. Der er et samlet antal og et filtreret antal; ingen forskelle fjernes fra modellen eller eksporten.
- Diff beregnes kun, når Scenarier er åbent, og genbruges mellem panel og scenariekort. Tidligere blev hele diff beregnet i alle appens renders og alle rækker skrevet i DOM.
- Faglige labels viser nu enheder, og hver række har eksplicit baseline/alternativ samt maskinens feltsti. Lister sammenlignes efter position, hvilket fremgår i panelet.
- Tal bruger op til 21 betydende cifre: en ændring på 0,0000000001 bliver ikke afrundet til nul. Kontroltegn escapes. Lange tekster og samlede objekter får en begrænset forhåndsvisning; eksempelvis vises en ny liste med 100.000 sager som et antal, ikke en stor JSON-streng.
- Hent alle inputændringer eksporterer samtlige fulde værdier med model-id/revision, også når søgning eller en anden side skjuler dem. Det eksisterende fulde rapportdiff er uændret.

## Verifikation

- 101 Flow-/motortests på 14 filer grønne; typecheck og produktionbuild grønne. En 100.000-sagers fixture ændrer hvert ankomsttidspunkt, bevarer præcis alle 100.000 forskelle og JSON-roundtripper dem. Revision/model-id/canvaskoordinater udelades fra den faglige oversigt.
- `input-differences-check.ts` er kørt i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Virkelig modelimport med 1.201 forskelle, højst 20 DOM-rækker, side 61, filtrering, tom søgning, fuld JSON-download under aktivt filter og komplette 1.200-elemementers lister ved skift af ankomstmetode.
- Axe WCAG2A/AA/21AA: 0 fund. Ingen browserfejl eller viewportoverflow. Mobilpanel visuelt inspiceret. Eksisterende journey-gate med kapacitetsændring, undo, snapshots og eksport består.
- Beviser: `reports/flowlab/*-input-differences-check.json`, `*-input-differences.png`, `engine-tests.txt`, `journey-check.json`.

Ingen ændring i motorberegning, inputdiff-kontrakt i motoren eller rapportens fulde data. Søgefeltet søger i feltsti, label og den viste forhåndsvisning; fulde sammensatte værdier findes i JSON.
