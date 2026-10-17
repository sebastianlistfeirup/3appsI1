# Varigheder — én tydelig antagelse ad gangen

Vælg en aktivitet eller planlagt vent, og vælg **Rediger varighed**. Dialogen er en kladde: **Anvend varighed** ændrer hele fordelingen på én gang. Annuller, krydset og Escape bevarer modellen. En anvendt ændring er ét trin i Fortryd/Gentag og gør et tidligere resultat historisk.

| Fordeling | Antagelse |
| --- | --- |
| Fast | Hvert besøg får den samme arbejdstid eller planlagte ventetid. |
| Trekantet | Minimum ≤ typisk ≤ maksimum. Typisk er toppen, mens det teoretiske gennemsnit er summen af de tre tal divideret med tre. Alle tre må være ens. |
| Eksponentiel | Et angivet gennemsnit og ingen fast øvre grænse. Lange besøg kan forekomme; gennemsnittet er ikke et loft. |

Dialogen viser det teoretiske gennemsnit fra parametrene, før motorens faktiske trækning og afrunding. Det er ikke et observeret resultat eller automatisk tilpasning til data. Motoren bruger samme dokumenterede seedstrømme som før.

Tider kan angives i millisekunder, sekunder, minutter eller timer. Dialogen vælger som udgangspunkt minutter, når de præcise tider er hele minutter, ellers sekunder eller millisekunder. En korrekt 1 ms vises derfor som **1 ms**, ikke nul minutter.

Komma og punktum accepteres som decimaltegn; undlad tusindtalsseparator, eksponentnotation og enheder i selve feltet. En indtastet tid skal være mindst 1 ms og højst 365 døgn før afrunding. Undergrænse og overgrænse kan ikke omgås gennem afrunding. Beregningen bruger decimalheltal, så værdier tæt på grænsen ikke afhænger af binær floating-point-afrunding.

Tiden afrundes til nærmeste hele millisekund, med halve millisekunder opad. Fx bliver `1,5` millisekunder til **2 ms**, og dialogen fortæller, at den har afrundet. Forhåndsvisning og model bruger samme afrundede tal. Tomt felt, negativt tal, for stort tal eller en ugyldig trekant kan ikke anvendes. Et skift af enhed bevarer de kanoniske heltalsmillisekunder; en ugyldig aktiv fordeling skal først rettes.

Planlagt vent optager ingen medarbejder. En aktivitet optager én enhed i sin valgte pulje. Kalenderpauser forlænger forløbet, mens den samme resterende arbejdstid genoptages ved næste åbning. Varighedsantagelsen omfatter derfor ikke automatisk hele sagens kalender- eller køtid.

## Efterprøvet rettelse

Den tidligere hurtigeditor afrundede minutter til tre decimaler og normaliserede tomme felter til 1 ms. En importeret 1 ms blev derfor vist som 0. Reproduktionen ligger i `reports/flowlab/duration-edit-reproduction.json`.

Domænetests og browsergaten `duration-editor-check.ts` dækker 1 ms gennem alle fire enheder, præcise grænser, decimaltegn, afrunding, samlet trekantredigering, undo/redo, rigtig 30-seed-kørsel, eksport og genindlæsning efter bekræftet lagring. Browserbeviser findes for Chromium, Firefox og WebKit på desktop, tablet og telefon.
