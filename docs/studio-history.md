# Find et tidligere forløb uden at miste historien

Under **Aktivitet** vises otte leveringsforløb ad gangen, nyeste først. Brug **Søg leveringsforløb** til at finde en låst opgavetitel, ansvarlig, et forløbs-id eller en briefversion som `brief v2`. Statusfilteret kan begrænse visningen til eksempelvis **Afventer fil** eller **Annulleret**. Søgning og status kombineres. Tælleren viser både antallet af match og projektets samlede antal forløb.

Søgningen bruger den opgaveaftale, der blev låst ved start. Et senere ændret navn eller en ny ansvarlig erstatter ikke historiske oplysninger. Ældre forløb uden opgavesnapshot bruger fortsat deres eksisterende projektreference; arbejdspakken beskriver denne begrænsning.

Links fra filinspektøren åbner den side, hvor netop det valgte run ligger, og flytter tastaturfokus til dets kort. Det virker også efter genindlæsning og ved en ændret hash i adressen. Et link til et ukendt run giver en besked og bevarer resten af historikken.

Aktivitetsloggen har sin egen søgning og viser 20 hændelser ad gangen. Søg eksempelvis på `rev 5001` for at finde en revision. Sideskift og filtre ændrer alene visningen: ingen historik slettes eller udelades fra projektets backup. **Hent arbejdspakke** på et gammelt kort bruger det pågældende forløbs oprindelige input.

Den lokale projektgrænse er fortsat 1.000 runs og 10.000 hændelser samt de samlede metadata- og filbudgetter. Opdelingen i sider udvider ikke lagergrænserne. Ved store produktioner kan du hente den fulde [projektpakke](studio-project-packages.md) og starte et nyt projekt for det videre arbejde.
