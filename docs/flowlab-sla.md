# SLA: rettidige afslutninger og endnu ukendte udfald

SLA er en grænse for tid fra sagens oprindelige ankomst til afslutning. Kø, planlagt vent og kalenderpause er med i gennemløbstiden. En afslutning præcis på grænsen er rettidig. En uafsluttet sag har et kendt brud, når forløbet tid ved motorens stop er **større end** grænsen; ellers er det endelige udfald stadig ukendt.

Under Resultater kan SLA-visningen skifte mellem gennemsnit og et bestemt fælles seed. Begge modeller viser deres egen grænse. Forskellige grænser markeres eksplicit og vises præcist i millisekunder: en højere andel kan være resultatet af en lettere målsætning uden hurtigere sager.

## Tre afstemninger

- Afsluttede inden for SLA + afsluttede efter SLA = afsluttede sager i målevinduet.
- Kendte SLA-brud i restkøen + endnu ukendte SLA-udfald = alle uafsluttede sager ved stop.
- Afbrudte sager vises separat; de fremstilles ikke som normale afslutninger eller almindelig restkø.

Ved gennemsnit er hvert antal middel af kørslernes antal. SLA-andelen er middel af de kørsler, der har afsluttede sager, som i det øvrige resultatpanel. Den er ikke en sammenlagt andel på tværs af forskellige antal sager. UI og PDF oplyser, hvor mange kørsler der har en kendt andel. Nul afslutninger giver ukendt andel, hverken 0 % eller 100 %.

Afslutninger før målestart indgår ikke i disse afslutningsmål. En sag, som ankom før målestart og afsluttes senere, har fortsat SLA målt fra sin oprindelige ankomst. Restkøen omfatter alle ankomne, uafsluttede sager ved stop, også fra før målestart. Derfor må restkøen ikke behandles som en gruppe med nye ankomster alene i målevinduet.

## Et lille, eksakt eksempel

Sager ankommer efter 0/60/120 sekunder og kræver 90 sekunders arbejde med én medarbejder. Modellen stopper efter 200 sekunder, og SLA er 100 sekunder.

- Første sag afsluttes efter 90 sekunder: rettidig.
- Anden afsluttes efter 180 sekunder: 120 sekunders gennemløbstid og derfor brud.
- Tredje er uafsluttet og har kun været i systemet i 80 sekunder: endnu ukendt SLA-udfald.

Andelen blandt afsluttede er 50 %. Restkøen er én ukendt sag. Med nul medarbejdere afsluttes ingen: andelen er ukendt, restkøen er tre, to har allerede overskredet grænsen og én har ukendt udfald. En SLA-grænse på 200 sekunder ændrer de tre uafsluttede til ukendte udfald ved samme stop; den skaber ikke hurtigere behandling.

## Eksport

Rapportens selvstændige SLA-side viser samme tal og betydning som UI. `sla.csv` indeholder en række pr. seed/modelside med faktisk status, grænse, målestart, målt stop, afsluttede inden/efter SLA og kendte/ukendte brud i restkøen. Tider er heltalsmillisekunder; `completed_share` er en andel fra 0 til 1. Et tomt felt betyder ukendt og skal ikke omfortolkes til nul. Rapportens JSON indeholder de oprindelige run-metrics.

Beviser: `sla-profile.test.ts`, `sla-profile-check.ts`, `reports/flowlab/*-sla-profile-check.json`, `*-sla-report.pdf` og `*-sla.csv`. Motoren er uændret; visningerne afstemmes mod de faktiske 30 parrede resultater.
