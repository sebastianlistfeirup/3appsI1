# Forsøgsrammer i FlowLab

Under **Scenarier → Forsøgets rammer** kan begge modeller få samme tidsvindue og hændelsesloft. Felterne er et udkast, indtil **Anvend fælles rammer** vælges. En ændring gør det tidligere resultat forældet; beregn igen før en ny beslutningsrapport eksporteres. Fortryd/gentag bevarer den forrige tilstand.

## Tid og opvarmning

- **Simulationshorisont** er tidspunktet, hvor simuleringen stopper. Ingen sag færdiggøres automatisk efter stop.
- **Målestart** er begyndelsen på observationsvinduet. Arbejde og køer før dette tidspunkt fortsætter normalt. Kun sager afsluttet fra og med målestart tæller i throughput og de afsluttede sagers tidsmål.
- En sag, som ankom før målestart og afsluttes efter, får stadig gennemløbstid fra sin oprindelige ankomst. Opvarmning skærer ikke en del af sagen væk.
- Restkøen omfatter ankomne, uafsluttede sager ved stop. Aktiv behandling, aktivitetskø og planlagt vent vises særskilt.
- Perioden skal være positiv og højst 365 døgn. Målestart skal være tidligere end stop. UI-felter bruger timer; motor og maskinlæsbare eksporttal bruger heltalsmillisekunder.

## Omkostninger

Det faste automationsbeløb medregnes én gang i hver replikation og dækker hele simulationsperioden. Det bliver hverken divideret med antallet af replikationer eller automatisk reduceret efter målestart. Baseline og alternativ kan have forskellige beløb. Planlagt lønkapacitet og variable aktivitetsomkostninger lægges til særskilt.

Beløbet skal være endeligt, mindst nul og højst 1.000.000.000.000 kr. Store beløb vises som mia. kr. i overblik/PDF; rapportens JSON og CSV bevarer det fulde numeriske beløb. Brug selv et begrundet beløb for den valgte periode; appen vælger ingen økonomisk afskrivningsmodel.

## Hændelser og nye sager

Hændelsesloftet er et heltal fra 1 til 5.000.000 pr. replikation. Når loftet nås, er resultatet ufuldstændigt. **Hent partial JSON** giver de faktisk beregnede par og advarsler. En komplet rapport kræver 30 fælles, fuldførte seeds med de aktuelle input.

Ved Poisson-ankomster kan kildens egenskaber sætte **Loft for nye sager**. Det er et sikkerhedsloft, ikke det forventede antal. Forventede nye ankomster beregnes fra periodens længde og gennemsnitligt ankomstinterval. Nye sagers loft plus startrestkø må højst være 100.000. En manuel/eksplicit ankomstliste anvender sine egne sags-id'er og tidspunkter.
