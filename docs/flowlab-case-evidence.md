# Sagsforløb og reproducerbarhed

I Resultater kan en bruger vælge en sag fra den første parrede kørsel. FlowLab genberegner begge frosne modeller med præcis det første seed. Alle øvrige sager deltager stadig i køer, ressourcekonkurrence og tilfældige træk; `evidenceCaseId` begrænser kun de gemte hændelser og arbejdsintervaller.

Den genberegnede sag skal matche den bevarede sag på alle `CaseResult`-felter, før UI viser dens hændelsesforløb. Ældre motorversioner kan ikke undersøges med en ny motor; en ny sammenligning er nødvendig. Browser-workerens identitet beskytter mod sene svar efter afbrydelse, valg af en anden sag eller skift af resultat.

## Hvad tidsregnskabet betyder

- **Køtid:** tid før aktivitetsstart, inklusive forløbet ventetid for en uafsluttet sag.
- **Aktivt arbejde:** summen af faktisk planlagte arbejdsintervaller, afskåret ved det reelle observationsstop.
- **Planlagt vent:** venten i et eksplicit ventetrin, afskåret ved observationsstop.
- **Pause i kalender:** resten af tiden efter aktivitetsstart, hvor ressourcen ikke arbejder. En opgave beholder sin ressource og trukne varighed gennem vagtskift.
- **Forløbet tid:** fra ankomst til afslutning; for en uafsluttet sag kun til observationsstop. En censureret sag får ingen opdigtet afslutning eller endelig gennemløbstid.

Ved et afskåret arbejdsintervalspor er kalenderpausen ikke beregnelig og vises som manglende, sammen med motorens diagnostik. UI viser afrundede enheder; JSON bevarer heltalsmillisekunder. Hændelsestabellen viser 100 rækker ad gangen; sagslisten viser 20. Arbejdsintervaller har en begrænset forhåndsvisning på 200 og følger fuldt med i JSON op til motorens dokumenterede evidensgrænse.

## Motorversion 1.3.0

`mulberry32-fnv1a/2` hasher alle UTF-16-kodeenheder ved afledning af tilfældighedsstrømme. Før rettelsen tabte et `for..of` + `charCodeAt(0)` den lave surrogate-halvdel, så forskellige astrale tegn i aktivitetens id kunne dele strøm. ASCII/BMP-sekvenser og det låste tidligere golden-seed er uændrede; Unicode-strømme får korrekt adskillelse med eksplicit versionsbump.

Et `visitId` er nu en JSON-tuple `[caseId,nodeId,visitNumber]`. Kolonholdige case-/node-id’er kan derfor ikke skabe samme besøgs-id via tekstkonkatenering. Arbejdsintervaller får også dette besøgs-id, så genarbejde kan spores entydigt.

`inspectCase` er en ren motorfunktion. Browseren har hverken en separat KPI-formel eller en syntetisk hændelsesgenerator. JSON indeholder begge modeller, motor-/PRNG-version, seed, valgte sagsresultater, faktiske hændelser, arbejdsintervaller og tidsregnskab.

## Versionskontrol

Ny rapport, holdout og genafspilning kræver både den låste motorversion og `mulberry32-fnv1a/2` på hver underliggende kørsel. Et historisk resultat med ukendt eller afvigende PRNG-version forbliver læsbart, men kan ikke bruges som et nyt aktuelt bevis. Kør sammenligningen igen. Case-workerens interne besked kontrollerer også begge første kørsels PRNG-versioner før genberegning.
