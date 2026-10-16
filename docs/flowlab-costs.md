# Omkostninger og medarbejdertid i FlowLab

Åbn **Resultater → Se, hvad kapaciteten koster** efter en sammenligning. Vælg gennemsnittet eller et bestemt fælles seed. Tallene kommer fra den samme kørsel som throughput, kø og gennemløbstid; de er ikke et særskilt budgetoverslag.

## Hvad betales der for?

| Bestanddel | Motorens beregning |
| --- | --- |
| Reserveret løn | Puljens åbne tid inden for målevinduet × kapacitet × timeløn. Lønnen medregnes også, når ingen opgave bruger medarbejderne, eller ingen aktivitet refererer til puljen. |
| Startede aktivitetsbesøg | Aktivitetens variable pris, hver gang et besøg begynder inden for målevinduet. En sag behøver ikke blive afsluttet. Besøg startet før målevinduet opkræves ikke igen. |
| Fast automation | Modellens faste beløb én gang pr. kørsel. Beløbet reduceres ikke automatisk ved en senere observationsstart eller en ufuldstændig kørsel. |
| Samlet omkostning | Summen af de tre bestanddele. |

Alle priser er kroner. Fast automation er en modelantagelse for forsøget, ikke en automatisk beregnet månedlig faktura eller investeringens afskrivning.

## Tid er summen af medarbejdernes tid

To medarbejdere, som hver er til rådighed i tre minutter, giver **seks minutters reserveret medarbejdertid**. Hvis de tilsammen arbejder i to minutter, er fire minutter ledige. Udnyttelsen er 2/6, men lønnen betales for alle seks minutter.

Arbejdsplanens pauser bidrager hverken til reserveret eller optaget tid. Kørslens observationsstart og faktiske stoptid afgrænser begge mål. Det gælder også igangværende besøg, som kun delvist ligger i målevinduet.

En pulje med nul kapacitet har nul tid og løn; udnyttelsen er ukendt, fordi nævneren er nul. En pulje, som kun findes i én model, er markeret som manglende på den anden side. Den vises ikke som en fiktiv pulje med nul i alle felter.

Ved gennemsnit beregnes tid og løn som middel pr. kørsel. Udnyttelse er middelværdien af de kørsler, som har planlagt kapacitet. Sidevisning og søgning begrænser kun den viste liste; eksporterne indeholder alle puljer og alle seeds.

## Kontrolleret eksempel

Den deterministiske golden-model har observationsstart ved 120 sekunder og stop ved 300 sekunder. En medarbejder til 100 kr./time reserverer tre minutter, svarende til 5 kr. Ét aktivitetsbesøg starter i målevinduet og koster 7 kr. Fast automation er 100 kr. Totalen er **112 kr.**

Alternativet har to medarbejdere i den samme pulje: 10 kr. Det har også en ubrugt reserve med to medarbejdere til 300 kr./time: 30 kr., selv om optaget tid er nul. Aktivitetsprisen er fortsat 7 kr., fast automation er 250 kr. Totalen er **297 kr.** Den viste forskel er **+185 kr.**

Hvis reserven fjernes fra modellen, falder den simulerede reserverede løn. Om dette kan omsættes til en faktisk besparelse, afhænger af bemanding, kontrakter og drift; ledige minutter dokumenterer ikke i sig selv en besparelse.

## Tag grundlaget med

- **Hent beløb for alle seeds** giver `flowlab-omkostninger.csv`. Rapportpakken indeholder de samme data som `costs.csv`.
- **Hent puljetal for alle seeds** giver `flowlab-ressourcer.csv`. Rapportpakken indeholder de samme data som `resources.csv`.
- CSV angiver observationens start og faktiske stop i millisekunder. `available_staff_ms`, `busy_staff_ms` og `idle_staff_ms` er summeret medarbejdertid i millisekunder. `utilization` er andelen 0–1, ikke procenttal 0–100. Beløb er DKK.
- PDF har en omkostningsside og en sideopdelt oversigt over alle puljer. Lang tekst kan forkortes i tabellens celler; fulde navne og id findes i CSV og JSON. `report.json` bevarer modeller, faktiske run-metrics og den fælles seedliste.
- CSV beskytter formellignende tekst med en apostrof. JSON bevarer de originale id og navne. Tal i CSV er uafrundede motorværdier; UI og PDF afrunder kun visningen.

En rapport kræver fortsat 30 fuldførte par med aktuelle modelinput. En ufuldstændig kørsel kan undersøges i resultatvisningen og eksporteres som partial JSON; den er ikke en færdig beslutningsrapport.
