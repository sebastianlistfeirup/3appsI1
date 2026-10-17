# Bestillingskladder i Studio One

En halvskrevet bestilling er en kladde. Den bliver først en ny, uforanderlig briefversion, når brugeren vælger **Gem ny version**. Kladden ændrer ikke eksisterende opgaver, låste runs, leverancer eller reviews.

Åbn **Bestilling → Ny briefversion**. Ændringer gemmes efter 450 ms uden indtastning og overføres straks til projektets lokale tilstand ved lukning af dialogen. **Luk kladde** og Escape bevarer teksten. **Fortsæt bestillingskladde** åbner den igen efter genindlæsning. Status siger først “gemt lokalt”, når IndexedDB har kvitteret for lagringen.

Projektet har højst én bestillingskladde. Den indeholder mål, målgruppe, rå acceptkrav, rammer, den oprindelige briefs id og et opdateringstidspunkt. Tomme og ufuldstændige felter må gemmes som kladde. En færdig bestilling kræver et mål og 1–30 acceptkrav på højst 1.000 tegn hver. For mange eller for lange krav bliver bevaret og forklaret; de bliver ikke skåret fra.

Hvis en nyere bestilling findes, bevares kladden på sit oprindelige grundlag. Brugeren skal gennemgå den nyere version og sætte en særskilt afkrydsning før oprettelse af endnu en version. Afkrydsningen gemmes ikke, eksporteres ikke og nulstilles ved genåbning, import eller ændret grundlag. Den nyere og alle ældre briefversioner forbliver uændrede.

Ved fuldt lager eller en versionskonflikt viser dialogen, at teksten er bevaret i den aktuelle side uden bekræftet lagring. **Hent bestillingskladde** giver en selvstændig JSON-fil, også i denne tilstand. Indlæsning kræver samme projekt-id, samme oprindelige brief-id og samme SHA-256 af det oprindelige briefs normaliserede indhold. Forkert projekt eller ændret grundlag bliver afvist, før de åbne felter ændres. Filen har format `studio-brief-draft/1` og højst 2,5 MB. De tre tekstfelter er hver begrænset til 100.000 tegn og acceptkravfeltet til 32.000 tegn; den samlede projektgrænse for metadata gælder stadig.

Projekt-ZIP og workspace-backup bevarer kladden sammen med historikken. En standalone kladde er derfor en genopretningsfil til det tilhørende projekt, ikke en komplet projektpakke. Arkiverede projekters kladder kan læses og hentes; redigering kræver, at projektet gendannes.

Bestillingshistorikken viser otte versioner ad gangen og kan søges på versionsnummer, mål og målgruppe. Søgning ændrer ikke den valgte historiske version. En ny version vises efter oprettelse, og kladden fjernes i samme projektændring.

Verifikation ligger i `apps/studio/src/lib/brief-drafts.test.ts` og `tests/e2e/studio-brief-drafts.spec.ts`: virkelige ZIP-filer, genindlæsning, faktisk IndexedDB-fejl, forkert projekt/hash, nyt grundlag, grænser og arkiveret læsning. Browserforløbet omfatter også en konkret rettelse i overblikket: base64-lagret HTML afkodes før sandbox-preview, og ugyldig UTF-8 giver en læsbar fallback frem for et nedbrud.
