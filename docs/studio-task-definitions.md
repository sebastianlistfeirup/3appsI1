# Opgavens aftale og låste færdigkrav

En bestilling beskriver projektets retning. En opgave har sin egen ansvarlige, beskrivelse og konkrete definition af færdig. Nye opgaver foreslår briefets krav; du kan tilpasse dem til netop det skridt, der skal udføres. **Ansvarlig** er et navn i det lokale overblik, ikke en brugerinvitation eller en ændring af adgang.

## Opret og tilpas

Under **Opgaver → Ny opgave** skriver du titel, beskrivelse, ansvarlig og ét færdigkrav pr. linje. Der skal være 1–30 forskellige krav, hvert på højst 1.000 tegn. Tomme, dublerede eller for lange krav bliver i formularen, så du kan rette dem; appen forkorter dem ikke automatisk. **Erstat med briefets krav** er en eksplicit erstatning af formularens krav.

En klar eller blokeret opgave kan redigeres, hvis den ikke har en aktiv levering og ikke er erstattet af en rettelsesopgave. Hvis en nyere bestilling findes, vælger du udtrykkeligt, om opgaven skal beholde sit grundlag eller bruge den nyeste briefversion. Det valg erstatter ikke automatisk dine opgavekrav.

Formularen bliver først en ændring af opgaven, når du vælger **Opret opgave** eller **Gem opgave**. Den er ikke en vedvarende kladde som bestilling, aflevering og review. Vent på **Gemt lokalt**, før du genindlæser.

## Start og review

**Levér** viser opgavens briefversion, ansvarlige og færdigkrav før start. **Lås input og fortsæt** gemmer titel, beskrivelse, ansvarlig, krav og opgaverevision i det konkrete leveringsforløb. Derudover låses de konkrete filversioner og briefversionen. Start erstatter ikke opgavens egne krav med hele projektets krav.

En opgave baseret på et ældre brief kræver en aktuel bekræftelse. Den bliver ikke husket efter lukning. Du kan i stedet vælge **Tilpas opgaven** og gennemgå den på den nyeste bestilling. Et gammelt resultat opfylder ikke automatisk den nye bestilling; leverancens review har fortsat sin separate kontrol af ældre input.

Afleveringen og reviewets kontrolpunkter følger de låste opgavekrav. En manuel aflevering angiver ikke, at en kodebuild eller automatisk test er kørt. Brugerens review afgør accept. Accept af én opgave godkender ikke andre opgaver eller hele projektet.

## Historik og rettelser

Under **Aktivitet → Låst opgaveaftale** kan du genåbne den præcise definition fra et tidligere run. Hvis en levering annulleres, kan opgaven tilpasses og startes igen; den annullerede version bevarer sin oprindelige titel, ansvarlige og krav. Reviewets **Låste input & historik** viser også aftalen ved start.

**Bed om ændring** opretter en rettelsesopgave med de uopfyldte opgavekrav: et krav er først gennemgået, når kontrolpunktet er bestået og afkrydset. Hvis alle krav er afkrydset, men kommentaren stadig beder om en ændring, bevares hele kravsættet på rettelsen. Rettelsen beholder den oprindelige ansvarlige og briefversion. En nyere bestilling overtages ikke i stilhed. Tidligere filer, leverance, run og review bliver bevaret.

Projekt-ZIP og samlet backup medtager disse aftaler. Ældre pakker uden et opgavesnapshot læses efter deres oprindelige låste brief; appen opfinder ikke en historisk aftale ud fra en nyere opgave.
