# Director: faktisk lokal renderprofil

MP4-knappen kontrollerer nu mere end `DIRECTOR_LOCAL_RENDER=1`. Før en eksport kan startes, afprøver serveren sin **faktiske** FFmpeg/FFprobe, DejaVu Sans og lokale H.264/AAC-profil. Kontrollen er kun tilgængelig efter den eksisterende loopback-, origin- og forwarded-header-kontrol. Den åbner ingen ekstern forbindelse og læser ingen projektmedier.

Kontrollen starter værktøjerne, kontrollerer de filtre som renderkæden bruger, afkoder skrifttypens danske tegn og kurver, koder en 30-frame / 1,25-sekunders prøvefilm med crossfade og tekst, verificerer 1280×720 / 24 fps / H.264 / AAC stereo 48 kHz med FFprobe og afkoder den færdige fil, inklusive EBU R128-måling. Der bruges højst to encodertråde og én complex-filtertråd. Alle delprocesser deler en frist på 25 sekunder; en overskridelse dræber den aktive proces. Procesoutput begrænses til 1 MiB, og midlertidige filer slettes ved både succes og fejl.

En ugyldig fontfil kan få FFmpeg til at falde tilbage til en anden skrifttype uden at fejle. Derfor er en læsbar fil og exitkode 0 ikke nok: fontkit skal afkode de forventede danske glyph-kurver, og prøverenderingen skal efterfølgende lykkes. Fontens SHA-256 og værktøjernes versionslinjer følger med kontrollens resultat.

Samtidige forespørgsler deler samme kontrol. Succes caches i fem minutter, fejl i 15 sekunder; en eksplicit genkontrol kan højst starte hver tiende sekund. Klienten har en 30-sekunders frist og afbryder ventende kald ved afmontering. Den viser årsagen, hvis serveren mangler et værktøj, og tilbyder genkontrol. Browserens JSON-, ZIP-, PDF- og teksteksporter er fortsat mulige. POST afviser med HTTP 503, før et projektjob oprettes, hvis renderprofilen ikke fungerer.

Dette er en afprøvning af serverens basale renderprofil, ikke et løfte om at alle indsendte mediefiler kan afkodes. Hvert projekt gennemgår fortsat sine egne valideringer og hver færdig film kontrolleres. Cloud, brugerlogin og betalingsrender er ikke tilkoblet. Serveren skal stadig bindes til loopback; host-/origin-kontrollen er ikke en offentlig godkendelsesmekanisme.

## Reproduktion

Efter produktionsbuild:

```sh
node --import tsx apps/director/tests/render-profile-smoke.mjs
PROFILE_ENGINE=chromium node apps/director/tests/render-profile-ui-flow.mjs
PROFILE_ENGINE=firefox node apps/director/tests/render-profile-ui-flow.mjs
PROFILE_ENGINE=webkit node apps/director/tests/render-profile-ui-flow.mjs
```

UI-testen starter sin egen produktionsserver på port 3107 (kan ændres med `DIRECTOR_PROFILE_TEST_PORT`). Først skjules FFmpeg reelt fra serverens PATH. Testen bekræfter HTTP 503, en forståelig forklaring og aktive browser-eksporter. Serveren genstartes derefter med fungerende værktøjer, og samme åbne editor bliver klar via genkontrol. Screenshots og WCAG 2 A/AA + 2.1 AA-scans dækker 1440×900, 1024×768 og 390×844. Testen slutter altid serverprocessen. Den native test har 90 sekunders ydre frist, UI-testen 180 sekunder; CI kan sætte henholdsvis 2 og 4 minutter.

Verificeret lokalt med Debian FFmpeg 7.1.5 og Ubuntu FFmpeg 6.1.1. Native fejlforløb omfatter manglende FFmpeg, manglende/ugyldig font, et program som påstår at have alle filtre og returnerer 0 uden at levere en film, en hængende proces som dræbes, 21 samtidige kontrolkald samt oprydning af midlertidige mapper.
