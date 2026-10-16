# Arbejd med ankomster

Vælg modellens ankomstnode og **Rediger ankomster**. Dialogen arbejder med en lokal kladde. **Anvend ankomster** opdaterer den valgte model i én ændring; **Luk uden at anvende** bevarer den tidligere model. Fortryd kan gendanne den anvendte ændring.

## Manuel liste

Hver sag har et entydigt sags-id, et tidspunkt fra simulationsstart og en sagstype. Tid kan indtastes i minutter, sekunder eller millisekunder og afrundes til nærmeste heltalsmillisekund. Eksisterende heltalstider bevares præcist ved åbning og genanvendelse.

1. Brug **Føj sag til kladden** til at tilføje en sag.
2. Vælg blyanten ved en eksisterende sag, ret felterne, og vælg **Opdatér sag i kladden**.
3. Papirkurven fjerner kun sagen fra kladden, indtil hele ændringen anvendes.
4. Søg på sags-id eller sagstype. Der vises højst 20 sager på én side; direkte sidevalg giver adgang til store lister.

Sagsfelter, som endnu ikke er tilføjet/opdateret, blokerer anvendelse af listen. Opdatér sagen eller annullér felterne. Dermed bliver en halv indtastning ikke stiltiende væk ved anvendelse.

Der må højst være 100.000 sager. Sags-id og sagstype skal have 1–100 tegn uden kontroltegn. Et eksisterende id kan ændres, men skal fortsat være entydigt. Id'et indgår i sagens tilfældighedsstrømme; ændring af id kan derfor ændre de trukne varigheder/ruter ved samme seed.

Sagstype bruges af modellens eksplicitte routingregler. I en beslutningsnode med sagstyper skal udgangene have entydige sagstyper uden sandsynligheder. En sagstype skaber ikke automatisk en ny rute.

## Periodens grænse

Kun sager med ankomsttid **strengt før** simulationsstop ankommer. En sag præcis ved stop tæller ikke som ankommet. Sager ved/efter stop bevares i listen og kan blive relevante, hvis horisonten forlænges. Dialogen viser både antal i perioden, antal uden for perioden og antal før målestart.

Målestart afgør ikke, om sagen ankommer. En sag kan ankomme under opvarmning og afsluttes i observationsvinduet. Det er afslutningstidspunktet, der afgør målevinduets throughput og tidsmål.

Listen behøver ikke være sorteret. Motoren ordner ankomster efter tid og derefter sags-id. Samme tidspunkt og samme model giver derfor en stabil rækkefølge.

## Poisson og metodeskift

Poisson-metoden trækker eksponentielle ankomstintervaller og bruger sagstypen `standard`. Startkøens sager ankommer ved tid nul. Det forventede antal nye sager og det maksimale antal er forskellige størrelser. Startkø plus loftet for nye sager må højst være 100.000.

Skift af metode er også en kladdeændring. Dialogen bevarer begge metoders lokale kladde, mens den er åben; ved anvendelse gemmes kun den valgte metode. Et skift fra Poisson til manuel starter med en tom liste. Der opfindes ingen konkrete sager. En anvendt tom liste giver nul ankomster og ingen observerede gennemløbstider.

Efter anvendelse bliver tidligere resultater forældede. Kør de 30 fælles seeds igen for at få en rapport, som afspejler de nye ankomster. Modelpakken og beslutningsrapportens JSON bevarer den anvendte liste; feltet er en modelantagelse og giver ikke automatisk ny CSV-proveniens eller en kalibreringsgodkendelse.
