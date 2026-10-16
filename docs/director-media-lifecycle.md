# Director: afbrydelse og medieoprydning

Import af billeder, klip, lyd og GLB kan afbrydes, før projektet ændres. Knappen ligger i importdialogens tastaturfokus; hvis dialogen lukkes under importen, ligger knappen i statusmeddelelsen. Et afbrudt eller fejlet forløb efterlader projektets seneste version urørt, og samme fil kan prøves igen.

Filindlæsning bruger nu FileReader, som kan afbrydes, med en frist på 15 sekunder. Native lyd-/videometadata har ti sekunder; billedafkodning og GLB-parsning har hver en frist på 15 sekunder, og den samlede medieimport har 45 sekunder. Alle trin modtager samme AbortSignal. Ved afmontering af editoren afbrydes den igangværende medieimport. Efter hashing kontrolleres signalet igen, så et sent resultat ikke bliver til en projektændring. SHA-256 og korte synkrone valideringer kan ikke standses midt i deres beregning; filgrænserne gælder fortsat.

Afsluttede importprober fjerner listeners og tidsfrister, stopper native afspilning, fjerner `src`, kalder `load()` for at frigive dekoderen og tilbagekalder deres object URL. Billedprober og storyboard-billeder fjerner også deres kilde efter brug; storyboardets canvas frigives, også hvis billedtegning fejler. Preview og klip-thumbnails ejer deres kilde gennem en React-effekt, som både opretter og fjerner den. Derfor virker oprydningen også ved StrictMode-genmontering og fanger ikke blot en ref, som allerede er blevet nulstillet.

GLB-import afbryder teksturkontrol og ventende parse. Three.js' native parse kan ikke altid stoppes straks. Et resultat som ankommer efter afbrydelsen destrueres derfor: geometri, materialer, teksturer og ImageBitmaps frigives, og ingen model føjes til projektet. Embedded object URLs tilbagekaldes også ved fejl. Sceneviewets egne modelindlæsninger afbrydes ved sceneskift/afmontering. En native operation som aldrig afsluttes kan ikke tvinges til at returnere fra JavaScript; UI-ventetiden og ressourcebudgetterne er stadig afgrænsede.

Lydgrafens kanaler afkobler deres egen gain-forbindelse. En gammel kanals cleanup kan ikke slette en nyere kanal med samme nøgle. Hele AudioContext, analysatorer, ducking og masterforbindelser lukkes ved afmontering; gentagen lukning er ufarlig. En normal afbrudt `play()`-promise vises ikke som en fejlagtig besked om ødelagt medie.

## Reelle browserforløb

```sh
LIFECYCLE_ENGINE=chromium node apps/director/tests/media-lifecycle-flow.mjs
LIFECYCLE_ENGINE=firefox node apps/director/tests/media-lifecycle-flow.mjs
LIFECYCLE_ENGINE=webkit node apps/director/tests/media-lifecycle-flow.mjs
```

Testen bruger en faktisk FFmpeg-genereret H.264/AAC-fil og det teksturerede GLB-fixture. For at ramme livscyklusgrænserne tilbageholdes metadata-eventet **efter native afkodning**, og et faktisk oprettet ImageBitmap forsinkes før aflevering til Three. Der bruges ikke et falsk dekoderresultat. Testen kontrollerer tastaturafbrydelse, ti-sekunders timeout, identisk bevaret projekt, vellykket genimport, destruktion af et sent GLB-resultat, fire reelle preview-afspilninger og lukket AudioContext efter skift til produktioner.

Instrumenteringen beholder referencer til de oprettede native objekter for at kunne bekræfte, at ingen afmonterede medier har `src` eller spiller, ingen import-object-URLs er aktive, FileReaders ikke indlæser, billedprober ikke har kilde, og det sene ImageBitmap er lukket. Dette er bevis for eksplicit ressourcefrigivelse, ikke en påstand om en bestemt OS-hukommelsesmåling eller tidspunkt for garbage collection.

Alle tre browsere har screenshots ved 1440×900, 1024×768 og 390×844 samt ni axe-scans uden fejl. Rapporter og billeder ligger i `reports/director/*-media-lifecycle.json` og `*-media-cancel-*.png`. Testen har 240 sekunders watchdog; CI kan sætte fem minutter. Headless Firefox skal have en fungerende PulseAudio-sink, som i de eksisterende medie-gates.
