# FlowLab — afsluttende produkt- og kontraktaudit

Status 17. oktober 2026, lokal udviklingssession. Dette er en afgrænsning af den byggede og efterprøvede lokale app; det er ikke en erklæring om offentlig produktionsdrift eller valideret forretning.

## Hvad bibelens centrale kontrakter er underbygget af

| Krav                                | Konkret implementering og bevis                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FL-AT01–07                          | Ren TypeScript-DES med de præcise golden-tider, determinisme, FCFS, kalenderpause, routing og begrænset genarbejde i `packages/flow-engine/src/engine.test.ts`.                                                                   |
| Bevaringslov og afgrænset udførelse | Hver registreret tilstand afstemmer sager. Hændelses-/besøgsgrænser giver partial/fejl; uafsluttede sager bliver ikke færdige for at pynte på resultatet. Tests omfatter samtidige belastninger og uafhængig differentialkontrol. |
| FL-AT08                             | Reel browserworker-cancellation bevarer sidste komplette resultat og kun afsluttede seedpar i partial-eksport. Partial kan ikke være beslutningsrapport.                                                                          |
| FL-AT09                             | CSV-validering med konkret række/felt/årsag, eksplicit mapping/enhed og synlige udeladelser. De rensede versioner bevares med kildehash.                                                                                          |
| FL-AT10                             | Samme seedplan, frosne modelinput, fuld inputdiff, motor-/PRNG-version og faktiske run-metrics i rapportpakken. Ufuldstændig seedplan eller inkompatibel PRNG afvises.                                                            |
| FL-AT12                             | Faktisk PDF, JSON og CSV afledes af samme resultater. Browserjourney kontrollerer de eksporterede KPI’er; PDF-stressprøve kontrollerer lange tekster, 100 puljer og maksimale beløb inden for sidemargener.                       |
| Observationstid                     | Ankomst ved stop er udenfor; afslutning ved stop tæller. Warm-up/startbeholdning har cohortmarkering og sagsvisning. Afsluttede før målestart holdes uden for de observerede tidsmål.                                             |
| Ressource- og prisregnskab          | Reserveret lønkapacitet, optaget tid, variable besøgspriser og fast automation er særskilte og afstemmes med de faktiske kørsler i UI/CSV/PDF.                                                                                    |
| Usikkerhed og manglende udfald      | Parrede forskelle, p10/p90, median/p90-tider og observationstal vises. Ukendt er ikke nul. Restkø og kendte/ukendte SLA-brud er særskilte.                                                                                        |
| Kvalitet mod data                   | Reel periodebaseret holdout med uafhængighed og komplethed. Baselines vurdering overføres ikke til alternativet; ændret model/motor bliver historisk. Ingen automatisk kalibrering påstås.                                        |
| Dagligt arbejde                     | Versionsbibliotek, navngivne scenarier, undo/redo, eksport/import med validering, synlige lagringsfejl, CAS-konflikter mellem faner og beskyttelse mod sene worker-svar.                                                          |
| Browser og tilgængelighed           | De tre krævede viewports i Chromium/Firefox/WebKit, axe WCAG2A/AA/21AA, keyboard og reduceret bevægelse. Faktiske touch-events testes særskilt fra museklik i en smal viewport.                                                   |

De konkrete gates og artefakter findes i `apps/flowlab/tests`, `reports/flowlab` og checkpoints L01–L26. En grøn lokal gate er ikke automatisk en grøn remote CI; den integrerede CI-status fremgår af repositoryets workflows.

## Fund lukket under den sidste audit

- Tømning af hurtigfelter ændrede tidligere 4 medarbejdere til 0 og 8 timer til 1 ms. Feltkladde, eksplicit anvendelse og grænsevalidering erstatter de skjulte konverteringer.
- Firefox-touch kunne anvende plus på den gamle modelværdi. Den aktive kladde afsluttes nu før den næste pointerhandling, også ved faneskift, lukning og beregning.
- Holdout-status blev ikke konsekvent præsenteret på tværs af model og rapport. Aktuel/historisk status og den præcise baselineafgrænsning er nu fælles.
- Ny rapport og holdout accepterede en kørsels ukendte PRNG-version. Begge låste versioner kontrolleres nu, også før sagsreplay. Ukendt historik bevares læsbar.
- En statusmærket komplet rapport kunne have 30 af 31 ønskede seeds. Rapporten kræver nu den genberegnede komplette status og en konsistent seedplan.
- Firefox kunne gendanne eksportknappens tidligere enabled-state ved reload. Browserhistorikken er slået fra for den knap, mens den autoritative rapportvalidering fortsat gælder.

## Det er stadig ikke en kundeklar cloudtjeneste

Den lokale app accepterer syntetiske pilotdata og gemmer i browserens IndexedDB. Dens beregningsknap bruger browserworkers. Login, kunde-workspaces, roller, betaling, abonnementer og live driftsdata er ikke tilkoblet denne brugerrejse.

Fælles backend-, Postgres/RLS-, fil- og jobarbejde har særskilte integrationsbeviser og ejerskab. FL-AT11 kan ikke erklæres opfyldt for en hosted FlowLab-brugerrejse alene på grundlag af lokal IndexedDB eller isolerede adgangstests. Den egentlige kundesti skal forbinde login, tenantidentitet, modeller, dataversioner, job og rapportadgang og gennemføre relevante adgangs-/recoverytests i det godkendte målmiljø.

Betaling og faktisk betalingsvillighed er ikke verificeret. En betalt privat pilot og observation af rigtige brugere er fortsat en kommerciel og driftsmæssig gate. Ingen automatisk bemandingsoptimering, multi-resource-aktivitet, drain-mode eller AI-genereret forklaring er skjult bag uvirksomme knapper.

Ydeevne er målt for en bestemt Node-workload: 20 noder, 10.000 sager og 30 enkeltmodelkørsler. En parret browserrapport er mere arbejde. Inputlofter er sikkerheds-/valideringsgrænser, ikke et løfte om at enhver kombination er hurtig på en telefon. Se `reports/flowlab/benchmark-30.json`.

## Før en offentlig release

Forbind og efterprøv den valgte autentificerede kundesti; bevis tenant/viewer/file/job-isolation, driftsrecovery og backup i målmiljøet. Gennemfør betalingsgates, privat pilot og brugerobservation. Afklar databehandling og dokumentér driftens ansvar. Den lokale beslutningsoplevelse og numeriske kontrakt kan afprøves allerede nu uden at påstå disse manglende integrationer.
