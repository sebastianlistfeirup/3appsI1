# Vælg et præcist grundlag og tag arbejdet med

Når du vælger **Levér**, kan du åbne **Vælg inputfiler**. Vælg de filer, arbejdet skal bruge, og den konkrete version af hver fil. Du kan søge i filnavne og bladre i otte filer ad gangen. **Vælg alle nyeste** er et eksplicit valg; **Fravælg alle** starter med aftalen alene.

En almindelig opgave foreslår den nyeste version af hver fil. En rettelsesopgave foreslår det oprindelige grundlag sammen med de output, der blev gennemgået: et output erstatter kun sin egen filfamilies tidligere input. Materiale, som er tilføjet senere, bliver ikke automatisk en del af rettelsen. Du kan ændre valget før start.

Højst 100 filversioner kan vælges, og kun én version af samme filfamilie. Et større projekt bliver ikke stiltiende beskåret til 100 filer; vælg selv det nødvendige materiale. **Lås input og fortsæt** gemmer de præcise versions-id'er sammen med opgavens krav, ansvarlige, beskrivelse og briefversion. Senere ændringer i projektet ændrer ikke dette grundlag.

## Arbejd videre i egne værktøjer

I den åbne aflevering eller under **Aktivitet** findes **Hent arbejdspakke**. Den downloader en rigtig ZIP med:

- `aftale.md`: den låste opgave, ansvarlige, krav, projektmål og rammer.
- `inputs/`: kun de valgte originalfiler, med de præcise bevarede bytes.
- `context.json`: versions-id'er, filernes oprindelige navne, MIME, ophav og rettigheder samt aftalen og forløbets status ved eksport.
- `manifest.json`: størrelse og SHA-256 for alle indholdsfiler i pakken.
- `LAES-MIG.md`: den korte vej tilbage til aflevering og review.

Et sikkert, nummereret eksportnavn forhindrer navnesammenfald og undermappestier. Det originale filnavn er stadig i `context.json`. Tekst med BOM, danske tegn og andre Unicode-tegn bevarer sine oprindelige bytes.

Åbn filerne i dine egne værktøjer, udfør ændringen, og vend tilbage til den samme aflevering i Studio. Pakken starter ingen kode eller ekstern tjeneste. Den giver ikke automatisk godkendelse. Afsluttede forløb kan stadig eksporteres til inspektion, men en ny aflevering kræver et aktivt forløb eller en rettelsesopgave.

Ældre forløb uden et særskilt opgavesnapshot bruger deres oprindeligt låste briefkrav. Pakken mærker denne begrænsning og opfinder ikke en historisk opgavebeskrivelse.

## Bevar også en backup

Arbejdspakken indeholder udvalgte input. Den er ikke en fuld projektbackup og kan ikke importeres som et helt projekt. Hent også **Eksportér projekt** eller en [samlet workspace-backup](studio-workspace-backup.md), når historik, leverancer og kladder skal bevares.

Pakning foregår i en separat browser-worker. **Afbryd arbejdspakke**, lukning af dialogen eller navigation væk fra knappen stopper dens worker. Den låste aftale og originalfilerne bliver bevaret. Ved beskadigede valgte bytes stopper eksporten med en fejl; der leveres ikke en pakke med falsk integritetsmanifest.

De samme lokale budgetter gælder: højst 48 MB valgte filbytes, 4 MB aftale/metadata, 60 MB udpakket indhold og 64 MB ZIP. Pakningen har en grænse på ét minut. Den udelader aldrig en valgt fil for at passe under grænsen.
