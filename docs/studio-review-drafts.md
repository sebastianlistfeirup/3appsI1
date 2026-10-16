# Reviewkladder i Studio One

Kommentarer og afkrydsede acceptkrav gemmes som en ufærdig kladde til den konkrete levering. Efter en kort skrivepause eller navigation lægges ændringen i projektet. **Reviewkladde gemt lokalt** vises først, når browserens database har bekræftet skrivningen. En kladde er ikke et review og ændrer ikke leverancens status.

Kladder følger med projektets ZIP og kan hentes separat som `studio-review-draft` JSON. Indlæsning kræver samme projekt, levering og præcise outputversioner; et udkast til en anden levering afvises. Den separate fil er højst 100 KB, og kommentaren højst 5.000 tegn. Kladder tæller med i projektets eksisterende metadatagrænse på 4 MB. Gamle projektpakker uden reviewkladder kan fortsat læses.

Ved en lagerfejl bliver den aktuelle tekst i sessionen og kan hentes. Genindlæsning vender tilbage til den sidst bekræftede version, så hent først ændringer, der skal bevares. Hver levering har sin egen kladde, også når man skifter mellem versioner i reviewvælgeren. Arkiverede projekter viser kladden uden at tillade ændringer.

En bekræftelse af forældet input gemmes **ikke** i kladden. Et nyt brief eller ændrede filer kræver et nyt bevidst valg, og efter genindlæsning skal denne bekræftelse gives igen. Kladder kan kun referere til beståede kontrolpunkter i den pågældende levering. Et endeligt, gyldigt review fjerner kladden i samme projektændring, som opretter reviewet; en afvist handling bevarer den.

Verifikation omfatter faktisk IndexedDB, navigation før skrivepausen, separate leveringer, genindlæsning, ZIP-roundtrip, indlæsning af en forkert kladde og injiceret lagerfejl i Chromium, Firefox og WebKit. SVG leveret som base64 er desuden kontrolleret med rigtig browserrendering og blokeret script i et tomt iframe-sandbox. Dette er lokal lagring, ikke en tilkoblet cloudbackup.
