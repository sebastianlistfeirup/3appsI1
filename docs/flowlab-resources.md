# Ressourcepuljer og arbejdsplaner

Åbn ressourceoversigten ved at klikke på antallet af ressourcepools under modellens værktøjslinje. På en aktivitet findes også **Administrér alle puljer**. Dialogen viser den valgte models puljer og arbejder med en kladde. **Anvend ressourcer** opdaterer modellen samlet; lukning uden anvendelse bevarer den tidligere tilstand.

## Løn følger reserveret kapacitet

Lønomkostningen beregnes som planlagt medarbejdertid i observationsvinduet gange timeløn. En medarbejder, som er planlagt til tre minutter, koster tre minutters timeløn, også hvis ingen sag behandles. **Optaget tid** er den tid, motorens aktiviteter faktisk bruger; den er tælleren i udnyttelsen og ændrer ikke den planlagte løn.

Eksempel: stop efter fem minutter og målestart efter to minutter giver tre minutters målevindue. En pulje med én medarbejder til 100 kr./time har 5 kr. planlagt løn. En ekstra pulje med to medarbejdere til 300 kr./time har 30 kr. planlagt løn, også uden tilknyttede aktiviteter. Modellen viser derfor samlet 35 kr. Fjernes den ubrugte pulje, bliver budgettet 5 kr., mens de beregnede sagsforløb er uændrede. Dette beskriver fjernet planlagt kapacitet i modellen; en faktisk beslutning skal også afklare, om kapaciteten kan frigøres.

Oversigten beregner sin pris fra kladdens input. En ufuldstændig simulering kan være stoppet tidligere og har sine egne faktiske målegrænser. Variable omkostninger pr. aktivitetsbesøg og det faste automationsbeløb opgøres særskilt. Det faste automationsbeløb medregnes én gang pr. kørsel og reduceres ikke efter målestart.

## Puljer og referencer

- En aktivitet bruger én medarbejder fra én pulje ad gangen. Aktiviteter, som vælger samme pulje, deler kapaciteten.
- **Ny pulje** opretter en kladde med én medarbejder og timeløn nul. Angiv de relevante antagelser og tilknyt bagefter puljen i aktivitetens indstillinger.
- En pulje kan kun fjernes, hvis ingen trin henviser til den. Vælg en anden ressource på de tilknyttede aktiviteter først. Oversigten viser de berørte trin.
- Ubrugte puljer er synlige, fordi deres planlagte løn stadig indgår. Fjernelse ændrer ikke aktiviteternes øvrige henvisninger.
- Der må være højst 50 puljer, 0–1.000 medarbejdere pr. pulje og højst 1.000.000 kr. i timeløn pr. medarbejder. Nul medarbejdere lukker puljens kapacitet.

## Arbejdsplan

En **tom arbejdsplan betyder åben i hele simulationsperioden**. Hvert eksplicit interval angiver fra/til i minutter efter simulationsstart. Et interval skal slutte efter sin start, og intervaller må ikke overlappe. De må støde op til hinanden. Ved anvendelse sorteres de efter start; grænserne gemmes som heltalsmillisekunder.

Arbejdet sættes på pause uden for åbne intervaller og fortsætter ved næste åbning. Et 90-sekunders job med åbent 0–60 sekunder og igen fra 120 sekunder bliver således færdigt efter 150 sekunder. Kun arbejdsplanens overlap med målevinduet indgår i planlagt løn og udnyttelse. Ingen automatisk overtid tilføjes efter simulationsstop.

Der må være højst 1.000 intervaller pr. pulje og højst 365 døgn til intervallets slutning. Store planer viser 20 intervaller ad gangen og har direkte sidevalg. Ændringer på andre sider og i andre puljer bliver i kladden. **Nulstil til åben hele perioden** fjerner arbejdsplanen med den udtrykkelige betydning, at puljen er åben i hele perioden.

Ved anvendelse kontrolleres alle puljer og arbejdsplaner, også felter på andre sider. Ugyldige værdier, overlap og manglende referencer blokerer ændringen samlet. Genberegn de 30 fælles seeds før en ny rapport. Fortryd/gentag kan gendanne den tidligere model.
