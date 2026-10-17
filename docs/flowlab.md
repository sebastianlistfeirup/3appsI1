# FlowLab — fra antagelse til beslutning

FlowLab sammenligner to modeller af et sagsflow med de samme tilfældige seeds. Det viser afsluttede sager, restkø, tider, SLA, kapacitet og omkostninger og eksporterer et efterprøveligt beslutningsgrundlag.

Standardappen er en lokal demo til syntetiske data. Beregning sker i browserworkers, og arbejdsrummet gemmes i denne browsers IndexedDB. Knappen **Kør sammenligning** kalder ingen betalt tjeneste. Den separate server-/backendprofil er beskrevet i repositoryets backenddokumentation; den lokale knap er ikke en cloudintegration. Betaling, samarbejde mellem brugere og live driftsdata er ikke tilkoblet den lokale oplevelse.

## Start appen

Fra repositoryets rod med Node 24 og projektets pnpm-version:

```sh
pnpm install --frozen-lockfile
pnpm --filter @tre/flowlab dev
```

Åbn `http://localhost:3001`. En produktionsbuild kan køres med:

```sh
pnpm --filter @tre/flowlab build
pnpm --filter @tre/flowlab start
```

Brug samme origin hver gang. `localhost`, `127.0.0.1`, en anden port og en anden browser har forskellige lokale lagre. Første åbning opretter Medlemsservice og beregner en rigtig sammenligning med 30 parrede kørsler.

## Dit første forsøg

1. Åbn **Baseline** i Modelværksted. Se ankomster, behandlingstid, medarbejdere og arbejdsplan. Eksempeldata er antagelser, ikke observeret medlemsservice.
2. Åbn **Scenarier**. Skriv, hvad du vil undersøge, og hvilken ændring du forventer vil gøre en forskel. Baseline er udgangspunktet; alternativet er din idé.
3. Redigér én antagelse i **Alternativ**. I den oprindelige skabelon har alternativet allerede én ekstra sagsbehandler.
4. Vælg **Kør sammenligning**. De 30 fælles seeds gør ændringerne sammenlignelige. Behold samme seed, når du vil undersøge én parameterændring.
5. Læs **Resultater**. Se både gennemløbstid og antal afsluttede, restkø, SLA-udfald og løn. Undersøg simulationsspredningen og en konkret sag, før du konkluderer.
6. Skriv din egen konklusion under **Rapport**, og hent rapportpakken. Beskriv også, hvad du vil måle i et afgrænset forsøg i virkeligheden.

En lavere median kan opstå, fordi de hurtige sager bliver færdige, mens komplekse sager bliver i restkøen. Skabelonen **Sagsfordeling** viser netop dette: samme løn, lavere median blandt afsluttede, men færre afslutninger og mere restkø.

## Byg og redigér flowet

| Trin | Betydning |
| --- | --- |
| Ankomst | Manuel liste med id/tid/sagstype eller Poisson-interval med loft og startrestkø. |
| Aktivitet | Bruger én enhed fra én ressourcepulje. Har fast, trekantet eller eksponentiel varighed. |
| Beslutning | Sender sagen videre efter entydig sagstype eller eksplicitte sandsynligheder, der summerer til 100 %. |
| Planlagt vent | Tid uden brug af en medarbejder. Den er særskilt fra aktivitetskø. |
| Genarbejde | Et begrænset returløb, der bevarer sags-id. Flere besøg er ikke flere unikke sager. |
| Afslutning | Sagen er færdig og kan indgå i observationsvinduets throughput og tidsmål. |

Vælg et trin på diagrammet eller i **Vis listeeditor**. **Tilføj trin** åbner paletten; forbindelsen til næste trin kan sættes med en formular i inspectoren. Diagrammets pile følger nodernes placering. Det er ikke en automatisk optimering af processen.

**Tastatur:** Tab flytter fokus. Enter/mellemrum vælger en node og dens indstillinger; piletaster flytter den. Shift+piletast flytter længere. Fortryd/gentag er tilgængeligt i værktøjslinjen. Slet trin og forbindelser i formularen. Fanerne understøtter piletaster, Home og End. Telefonen åbner som standard den læsbare listeeditor; diagrammet kan vælges og zoomes.

Hurtigfelterne i inspectoren har en synlig kladde, mens du skriver. **Enter** eller at forlade feltet anvender en gyldig indtastning som én ændring. **Escape** annullerer. En tom eller ugyldig værdi bliver aldrig stiltiende til nul eller en minimumsværdi; forlader du et ugyldigt felt, bevares den tidligere modelværdi med en forklaring. Bekræftet lokal lagring gælder den anvendte model. Se [Sikker feltredigering](flowlab-inspector.md).

**Rediger varighed** åbner en samlet kladde for fast, trekantet eller eksponentiel tid. Vælg millisekunder, sekunder, minutter eller timer. Tomme/ugyldige felter ændrer ikke modellen; **Anvend varighed** kræver gyldige tal og bliver én fortrydelig ændring. Se [Varigheder](flowlab-durations.md) for grænser, afrunding og fordelingernes betydning.

En aktivitet tager én medarbejder fra én pulje ad gangen. Aktiviteter med samme pulje konkurrerer om den samme kapacitet. Samme person må ikke modelleres dobbelt i to overlappende puljer. Køen er FCFS med et stabilt sags-id som tie-breaker. Flere samtidige ressourcetyper, anden prioritering og bemandingsoptimering er ikke implementeret.

Læs de konkrete arbejdsgange i [Ankomster](flowlab-arrivals.md), [Ressourcepuljer](flowlab-resources.md) og [Forsøgsrammer](flowlab-experiments.md). Bibliotekets fire syntetiske eksempler og deres kendte resultater er beskrevet i [Skabeloner](flowlab-templates.md).

## Tidsvinduet er en del af forsøget

Motoren bruger heltalsmillisekunder fra simulationsstart. UI angiver timer/minutter, hvor felterne er mærket med disse enheder. **Forsøgets rammer** under Scenarier kan anvende samme simulationsstop, målestart og hændelsesloft på begge modeller.

- Ankomst præcis ved simulationsstop er uden for perioden. En afslutning præcis ved stop tæller med.
- Målestart er ikke en nulstilling. Sager fra før målestart beholder kø, arbejde og oprindelig ankomsttid.
- Gennemløbstid og køtid beskriver kun sager, der afsluttes i målevinduet. Uafsluttede sager får ingen opdigtet sluttid.
- Ved kalenderpause stopper aktivt arbejde og fortsætter med samme resterende varighed ved næste åbning. Der trækkes ikke en ny varighed, og ingen overtid tilføjes efter stop.
- En tom arbejdsplan betyder åben i hele perioden. En pulje med nul kapacitet har ukendt udnyttelse, ikke nul procent udnyttelse.

## Læs resultaterne korrekt

| Visning | Hvad du kan bruge den til |
| --- | --- |
| KPI-overblik | Middel af kørslernes resultater for baseline og alternativ. |
| Inputdiff | De faktiske ændringer i antagelser; søgning og sidevalg ændrer ikke den fulde eksport. |
| Parrede udfald | Fordeling af alternativ minus baseline for samme seed. Median og 10.–90.-percentil er simulationsspredning. |
| Kødiagram | En faktisk tidskurve fra første fælles seed, ikke et gennemsnit af alle kørsler. |
| Sagernes tider | Median, p90, antal observationer, planlagt vent og restkø for et valgt seed. |
| Kapacitet og omkostning | Reserveret/optaget medarbejdertid, løn, variable aktivitetspriser og fast automation. |
| SLA og restkø | Afsluttede inden/efter grænsen samt kendte/ukendte brud blandt uafsluttede. |
| Sagsforløb | Genberegner én konkret sag med samme model og seed, mens de andre sager stadig konkurrerer om kapacitet. |

Et gennemsnit af kørslernes medianer er ikke medianen af alle sager lagt sammen. En ukendt værdi vises som **—** og udelades fra et gennemsnit; den bliver ikke erstattet med nul. Antal tilgængelige par eller observationer vises ved resultatet. Simulationsspredningen er ikke et konfidensinterval for virkeligheden.

Løn følger **reserveret kapacitet i målevinduet**, også ved ledig kapacitet og ubrugte puljer. Variabel aktivitetspris opkræves ved et besøgs start i målevinduet. Et genbesøg kan derfor koste igen. Fast automation medregnes fuldt én gang pr. kørsel og reduceres ikke automatisk efter målestart. Se [Omkostninger](flowlab-costs.md).

SLA regnes fra oprindelig ankomst, inklusive kø, planlagt vent og kalenderpauser. Præcis på grænsen er rettidigt for en afsluttet sag. Uafsluttede sager med forløbet tid større end grænsen har et kendt brud; resten har ukendt endeligt udfald. Ingen afslutninger betyder ukendt SLA-andel. Se [SLA](flowlab-sla.md) og [Sagsforløb](flowlab-case-evidence.md).

## Data og holdout

Dataværkstedet læser UTF-8 CSV lokalt med eksplicit mapping og tidsenhed. Ukendte kolonner bliver ikke automatisk modelinput. Fejl viser række, felt og årsag; udeladelse kræver en synlig beslutning. Der imputeres ingen manglende værdier. Gem den validerede version, før en median overføres til en aktivitets varighed.

**Brug median som fast varighed** ændrer en antagelse. Det beviser ikke, at modellen matcher virkeligheden. En særskilt holdout-periode skal have kendte ankomster, eksplicit afsluttende aktivitet og alle relevante forløb, inklusive restkø. Den må ikke være den kildefil, som allerede blev brugt til at tilpasse modellen.

Holdout sammenligner baseline med den observerede periode og kræver mindst 30 fuldførte seeds. Pilotmålet er højst 15 % afvigelse på throughput og median gennemløbstid. Mangler og små stikprøver vises. Modelændringer gør en tidligere vurdering historisk; import af en arbejdsrumspakke kræver en ny beregning og holdout-vurdering.

Læs [CSV-kontrakten](flowlab-csv.md) og [Holdout-kontrakten](flowlab-holdout.md) for præcis fortolkning, datamangler og provenance.

## Gem, skift scenarie og tag en sikkerhedskopi

Toplinjens **Gemt lokalt** betyder, at browserens lagring er bekræftet. **Gemmer** betyder, at ændringen stadig afventer lagring. Ved fejl eller konflikt bevares dokumentet i hukommelsen, så det kan eksporteres. Genindlæs ikke en ugemt kladde, før du har gemt en kopi.

**Gem version** skaber et snapshot af modellerne og forsøgets kontekst. Et skift til et gemt scenarie, en frisk skabelon eller et nyt alternativ bevarer den ændrede kladde gennem versionsbiblioteket. Når lagerets pladsgrænse er nået, skal en gammel version fjernes eksplicit; appen sletter ikke automatisk en kladde for at skabe plads.

**Eksportér arbejdsrum** i Modelbibliotek er sikkerhedskopien til fortsat arbejde. Den bevarer modeller, snapshots, seed, tekster og dataversioner. Beregnede sammenligninger hører til i rapportpakken. Ved import valideres inddata og rensede data igen, mens gamle beregninger og holdout-vurderinger kasseres og skal genberegnes. En fremmed fil kan derfor ikke medbringe en falsk godkendt analyse.

Aktuelt datagrundlag og op til tre tidligere versioner kan gendannes, eksporteres og fjernes. En historisk holdout kan bevare sine tal og kildehenvisning efter fjernelse af dataversionen; appen fortæller da, at de rensede rækker mangler. En tidligere rapportpakke kan stadig indeholde dem.

Rydning af browserdata, privat browsing eller flytning til en anden origin er ikke en backup. Eksportér arbejdsrummet regelmæssigt, og gem beslutningsrapporten ved de vigtige beslutninger.

## Hvad eksporterne indeholder

En aktuel beslutningsrapport kræver mindst 30 fælles fuldførte seeds, samme målevindue, den aktuelle motorversion og input, som stadig matcher sammenligningen. Ændrer du model eller seed, bevares det gamle resultat tydeligt som historisk, men en ny aktuel rapport kræver genberegning.

| Fil | Indhold |
| --- | --- |
| `rapport.pdf` | Resultat, usikkerhed, antagelser, sagstider, omkostninger, SLA og egen beslutning. Lange tekster, puljer og holdout får ekstra sider. |
| `report.json` | Frosne modeller, faktisk seedliste, motor-/PRNG-version, alle run-metrics, første seeds sager/tidskurver, inputdiff og rapportkontekst. |
| `models.json` | De to modeller, som faktisk blev beregnet. |
| `metrics.csv` | Overordnede resultater, parrede forskelle og antal tilgængelige par. |
| `time-summaries.csv` | Tidsmål og observationstal for hvert seed, i millisekunder. |
| `costs.csv` / `resources.csv` | Hver kørsels priser og hver puljes medarbejdertid, udnyttelse og løn. |
| `sla.csv` | Grænse, afsluttede inden/efter SLA og kendte/ukendte udfald i restkøen for alle seeds. |
| `holdout-renset.csv` | Medfølger, når den præcise dataversion for holdout stadig findes. |
| `LAES_MIG.txt` | Enheder og reproduktionsforklaring. |

Tekst, der ligner en regnearksformel, beskyttes med en apostrof i relevante CSV-eksporter. JSON bevarer de oprindelige strenge. PDF indeholder indlejrede skrifter og kan læses uden forbindelse til appen. Visninger afrunder; JSON/CSV bevarer motorens tal.

Hvis navn eller hypotese redigeres efter kørslens start, viser rapporten både den nuværende tekst og den frosne tekst ved start. Det ændrer ikke beregningens input. En manuel konklusion er brugerens vurdering, ikke en automatisk beregnet anbefaling.

## Når noget ikke kan køres

- **Manglende ressource eller forbindelse:** vælg den markerede node, ret feltet og valider igen.
- **Sandsynligheder summerer ikke til 100 %:** ret alle udgange på beslutningen. Ved sagstyper bruges entydige tekstbetingelser i stedet for sandsynligheder.
- **Ubegrænset cirkel:** returløbet skal indeholde en eksplicit begrænset genarbejdsnode. Overskredne besøg er en fejl, ikke en normal afslutning.
- **Nul kapacitet:** modellen kan stadig beregnes, men sager kan blive stående, og udnyttelse er ukendt. Se advarslen og restkøen.
- **Afbrudt eller begrænset job:** det sidste fuldførte resultat bevares. **Hent partial JSON** indeholder kun faktisk færdigberegnede par. En partial er ikke en komplet beslutningsrapport.
- **Lagringskonflikt:** en anden fane har ændret samme arbejdsrum. Eksportér din lokale kopi, før du genindlæser den senest gemte version.
- **CSV/arbejdsrum kan ikke læses:** den eksisterende version bevares. Ret den konkrete fejl eller afbryd; et sent svar fra den gamle worker kan ikke erstatte den nye fil.

## Grænser og efterprøvning

Den lokale motor accepterer højst 200 noder, 1.000 kanter, 50 puljer, 100.000 sager inklusive Poisson-startkø, 1.000 kalenderintervaller pr. pulje, 365 døgn og 5.000.000 hændelser pr. kørsel. Det er valideringslofter, ikke et løfte om hurtig behandling af alle kombinationer. CSV har 10 MB/100.000 rækker; arbejdsrumsimport 128 MB; dataversioner samlet 32 MB; snapshots højst 30 og samlet 16 MB. En særskilt serverprofil kan håndhæve lavere grænser.

Motoren er `flow-des/1.3.0` med PRNG `mulberry32-fnv1a/2`. En faktisk referencebenchmark med 20 noder, 10.000 sager og 30 enkeltmodelkørsler tog 36,36 sekunder og toppede ved 616.332 KiB RSS på den dokumenterede Linux/Node 24-maskine. En parret sammenligning beregner to modeller og er mere arbejde; tallet er ikke et browser-SLA. Se [benchmark-beviset](../reports/flowlab/benchmark-30.json).

Domænetests køres med:

```sh
pnpm exec vitest run packages/flow-engine/src apps/flowlab/src
pnpm --filter @tre/flow-engine --filter @tre/flowlab typecheck
```

Browsergates ligger i `apps/flowlab/tests`, kører mod `localhost:3001` og gemmer beviser i `reports/flowlab`. Den normale browser er Playwrights installerede version; et system-Chromium kræver eksplicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Gates med `FLOWLAB_BROWSER` køres i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Hvert milestone har et checkpoint med præcis udført/verificeret afgrænsning; skærmbilleder alene er ikke integrationsbevis.
