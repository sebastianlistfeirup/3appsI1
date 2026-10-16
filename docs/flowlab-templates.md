# Tre mekanismer, som kan undersøges i Modelbibliotek

Medlemsservice er stadig det første eksempel. Modelbibliotek har desuden tre færdige sammenligninger med syntetiske data. Hver skabelon indeholder en baseline, et konkret alternativ og en hypotese. Resultater beregnes først, når skabelonen åbnes; kortenes tal beskriver input, ikke påståede driftsresultater.

Et skift arkiverer det aktuelle udkast, hvis det ikke allerede er gemt. Det bevarer arbejdsrummets dataversioner, seed og beslutningskladde. Resultater fra den gamle model bliver ikke vist som resultater fra den nye. Et fuldt snapshotlager standser skiftet med en forklaring; intet tidligere snapshot ryger automatisk ud.

## Sagsfordeling

Tolv sager ankommer med fem minutters mellemrum. Seks enkle sager tager ti minutters arbejde; seks komplekse tager tredive. Baseline deler to medarbejdere mellem typerne. Alternativet reserverer én medarbejder til hver type. Begge modeller har to timers horisont, samme timepris og samme samlede lønkapacitet.

| Mål ved de uændrede input | Fælles team | Ét team pr. sagstype |
| --- | ---: | ---: |
| Afsluttede sager | 11 | 9 |
| Restkø | 1 | 3 |
| Median blandt afsluttede | 35 min | 10 min |
| Reserveret løn | 1.140 kr. | 1.140 kr. |

Alternativets lavere median er ikke en entydig forbedring: tre komplekse sager er endnu ikke afsluttet og indgår derfor ikke i medianen. Sagstyper og køkonkurrence ændres af opdelingen, selv om den samlede løn er ens. Eksemplet illustrerer, hvorfor median, restkø og sagsforløb skal læses sammen.

## Ansøgninger og genarbejde

Tyve ansøgninger ankommer med femten minutters mellemrum over seks timer. To medarbejdere behandler dem med en trekantet varighed på 8/12/20 minutter. Efter et aktivitetsbesøg kræver baseline med 30 % sandsynlighed en ny afklaring, tredive minutters planlagt vent og endnu et besøg. Cirklen er synlig og afgrænset til højst tyve besøg pr. node. Et aktivitetsbesøg koster 5 kr.; venten optager ingen medarbejder.

Alternativet ændrer kun antagelsen om genarbejde til 10 %. En eventuel investering eller indsatspris for at opnå reduktionen er ikke lagt ind. Det er heller ikke en påstand om, at en virkelig organisation kan opnå denne andel.

Med standardseed 2026 afslutter begge modeller tyve sager i det første par. Baseline har 24 aktivitetsbesøg og 120 kr. variabel pris; alternativet har tyve besøg og 100 kr. variabel pris. Baselines gennemsnitlige planlagte vent er seks minutter, mens alternativet i netop dette seed har nul. Begge reserverer 3.420 kr. i løn. På tværs af de tredive seeds varierer forløbene; eksempelvis har baseline i nogle seeds restkø. Disse første resultater gælder ikke som et facit for andre seeds eller ændrede antagelser.

## Arbejdsdag med pause

Fire sager ankommer ved minut 0, 60, 120 og 180. Hver kræver præcis 90 minutters arbejde fra én medarbejder. Dagen varer otte timer. Baseline holder pause ved minut 180–240; alternativet flytter pausen til 120–180. Begge reserverer syv medarbejdertimer, svarende til 1.995 kr.

Baseline afslutter sagerne ved minut **90, 180, 330 og 420**. Alternativet afslutter ved **90, 240, 330 og 420**: det andet besøg havde arbejdet tredive minutter, da den tidligere pause begyndte, og fortsatte med de resterende tres minutter efter pausen. Der trækkes ingen ny varighed.

Begge afslutter fire sager og har samme løn. Median gennemløbstid ændres fra 165 til 195 minutter. Den gennemsnitlige vent i aktivitetskø er 75 minutter i begge; kalenderpausen i det aktive besøg er ikke en ny køventetid. Fire syntetiske sager er et illustrativt eksempel, ikke et stort datagrundlag.

## Reproduktion

Motoren er fortsat `flow-des/1.3.0` med `mulberry32-fnv1a/2`. Baseline-fabrikkerne findes i `packages/flow-engine/src/templates.ts`; alternativerne i `apps/flowlab/src/lib/templates.ts`. De deterministiske forventninger, bevarelse af arbejde og seeded genarbejde er testet i `templates.test.ts`. Browsergaten `templates-check.ts` åbner alle skabeloner, kører tredive par, kontrollerer faktisk rapport-JSON og afprøver undo/redo, lagring og genindlæsning.

Åbn **Scenarier** for inputdiff, **Resultater** for spredning og sagsforløb, og **Rapport** for det samlede reproducerbare grundlag. Ret beslutningskladden, når du arbejder med en ny model; dens gamle tekst bevares med vilje ved skabelonskift.
