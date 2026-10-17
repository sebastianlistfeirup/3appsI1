# Studio One — fra bestilling til accepteret levering

Studio One samler bestillinger, opgaver, filer, leverancer og review i en lokal produktion. Du udfører arbejdet i dine egne værktøjer og afleverer resultatet i Studio. Den lokale udgave har ingen tilsluttet kodeagent, GitHub-adapter, betalingsfunktion eller hosted login. Alle eksempeldata er syntetiske.

## Start og behold dit arbejde

Kør `pnpm dev:studio` fra repositoryets rod efter installation af de låste afhængigheder. Åbn `http://localhost:3000`. Brug samme adresse og browser næste gang: en anden port, `127.0.0.1` og en anden browser har hver deres lokale lager.

Data gemmes i IndexedDB. **Gemt lokalt** betyder, at browserens transaktion er gennemført. En synlig lagerfejl eller konflikt betyder, at lagringen ikke er bekræftet. Hent en kopi af det åbne arbejde, før du genindlæser. Browserlagring er ikke en ekstern backup.

## Din første levering

1. Åbn **Produktioner → Nyt projekt**. Giv det et kort navn og beskriv ændringen. Projektprofilen er Webændring; Studio udfører ikke en Godot- eller webbuild på dine vegne.
2. Skriv målet, målgruppen og konkrete acceptkrav under **Bestilling**. Gem en ny briefversion, når den er klar. En ufærdig [bestillingskladde](studio-brief-drafts.md) kan lukkes og genoptages.
3. Tilføj input under **Filer & versioner**. Du kan oprette en tekstfil eller uploade en eksisterende fil. Angiv ophav og rettigheder; ukendt status bliver synlig, indtil du selv afklarer den.
4. Opret en konkret **Opgave** med en ansvarlig og egne [færdigkrav](studio-task-definitions.md). Tilføj afhængigheder, hvis noget skal være accepteret først. En cirkulær afhængighed bliver afvist.
5. Vælg **Levér**. Start det manuelle forløb, som låser de aktuelle inputversioner og briefversionen. Udfør ændringen i dine egne værktøjer. Indsæt et tekstresultat eller vælg en uploadet filversion, og beskriv resultatet og usikkerhederne.
6. Gennemgå **Leverancer**. Sammenlign den låste tidligere version med den nye. Se hvert kontrolpunkts grundlag, afkryds de beståede krav, og skriv din vurdering. Manuel bekræftelse er ikke et bevis for, at en ekstern build er kørt.
7. Vælg **Acceptér leverance** eller **Bed om ændring**. En rettelse bliver en ny opgave; det tidligere resultat og review bliver bevaret. Hent projektpakken, når du vil tage arbejdet med dig.

Realmread-eksemplet giver et færdigt lille forløb at undersøge: en menu får en questindikator. Både den tidligere og den nye HTML-version ligger som faktiske filer i projektet.

## Versioner, opgaver og review

Et nyt brief eller en redigeret fil bliver en ny version. Det ændrer ikke input i et allerede startet run. Hvis input er blevet nyere, vises leverancen som baseret på ældre input. Accept kræver da en særskilt, aktuel bekræftelse. En tidligere accept opfylder ikke automatisk den nye bestilling.

Filinspektøren viser præcis, hvilke runs og leverancer der bruger den valgte version. Tekstredigering bevarer MIME, ophav og rettigheder og registrerer den konkrete kildeversion. En rettelse af ophav giver en ny metadata-version med samme bytes. [Filversioner og ophav](studio-artifacts.md) beskriver grænserne; Studio registrerer brugerens erklæring og verificerer ikke selv en licens.

Opgavedetaljer viser beskrivelse, låst briefversion, acceptkrav, afhængigheder og eventuelle rettelsesforløb. En opgave kan blokeres med en årsag. Igangværende forløb kan genoptages eller annulleres; annullering sletter ikke den eksisterende kladde. En accepteret opgave kan ikke genåbnes som om dens tidligere resultat aldrig fandtes.

Ufærdige [afleveringskladder](studio-project-packages.md#afleveringskladder) og [reviewkladder](studio-review-drafts.md) gemmes separat fra en færdig levering eller beslutning. Reviewets afkrydsning for ældre input bliver aldrig gendannet automatisk.

## Preview og beviser

HTML og SVG vises i en sandbox uden scripts, formularafsendelse eller eksterne netværkskald. Det viser filens indhold og layout; det er ikke en fungerende ekstern app eller en test af JavaScript. Tekstdiff sammenligner de konkrete filversioner og kan vise også bevarede linjeskift. Store sammenligninger er begrænset, og filerne kan stadig hentes.

Et review binder beslutning, kommentar, kontrollerede krav og de præcise outputversioner sammen. Under **Aktivitet** kan du åbne det tilhørende forløb og se dets låste input. Lokal manuel levering har nul eksternt forbrug.

## Eksport, import og arkiv

**Eksportér projekt** giver en [ZIP med historik og SHA-256-manifest](studio-project-packages.md). Hver filversion bevarer originale bytes. Pakning og kontrol kører i baggrundsworkers; en pakke med ugyldige hashes eller referencer bliver afvist før oprettelse. Ved samme projekt-id tilbyder appen en selvstændig kopi.

Under **Indstillinger** kan du tage en [samlet backup](studio-workspace-backup.md) af valgte projekter. Forhåndsvis indholdet før indlæsning. Eksisterende projekter bliver bevaret, og dubletter indlæses som kopier. Arkiverede projekter beholder deres arkivstatus i en samlet backup.

**Arkivér** skjuler en produktion fra den aktive liste og stopper ny redigering. Du kan stadig læse og eksportere den og senere vælge **Gendan**. Filer, der indgår i en accepteret levering, bliver ikke fysisk slettet fra historikken.

De vigtigste lokale grænser er 100 projekter pr. workspace, 48 MB filindhold og 4 MB metadata pr. projekt. Projekt-ZIP må højst fylde 64 MB ved indlæsning; samlet workspace-backup har sine egne dokumenterede grænser. Filer og historik bliver ikke automatisk ryddet væk for at holde sig under grænsen.

## Valgfri serverprofil

Der findes en separat [autentificeret API og PostgreSQL-worker](backend-api.md), som er afprøvet med rigtige lokale processer, RLS, private uploads og genstart. Demoens browserdokumenter bliver ikke automatisk synkroniseret dertil. Den profil kræver egne servermiljøvariabler og en korrekt identitetstjeneste; den er ikke et tilsluttet cloudabonnement.
