# Director: projektbundet eksportarkiv

Eksportdialogen viser nu tidligere lokale eksportjobs fra **den samme produktion**. Listen indeholder navn og revision ved eksport, tidspunkt, sekvensversion, faktisk manifest-hash og status. En færdig film kan hentes direkte eller åbnes med sin oprindelige kvalitetsrapport og sine låste undertekster. Valg af en gammel eksport ændrer ikke den åbne produktion. En afbrudt render kan genoptages gennem den eksisterende checkpoint-kæde; visning af selve listen starter ingen renderjobs.

Listen læser kun små `status.json`-filer. Højst 100 mapper gennemgås, en status må højst være 128 KiB, alle felter schemastruktureres, og status-id skal matche mappens id. Symlink-status, byttet id, korrupt eller for stor status afvises. Manifest og mediefiler indlæses ikke for at vise listen. Ældre jobs uden projektbinding tælles særskilt og bliver ikke gættet ind i en produktion. En uventet fil ændres eller slettes ikke.

`GET /api/exports/history?projectId=...` bruger samme lokale opt-in-, loopback-, origin- og forwarded-header-grænse som render. Historikkens downloadlinks medsender projekt-id; serveren afviser, hvis det ikke stemmer med jobbets låste kilde. Det er stadig en lokal profil, ikke et cloud-login eller en tenant-adgangsmekanisme. Download kontrollerer altid den oprindelige films/sidecars' SHA-256. Filnavne indeholder en sikker ASCII-udgave af produktionens navn, revision og kort job-id.

## Præcis versionssammenligning

To importer kan have samme produktions-id og revisionsnummer, men forskelligt indhold. Derfor er revisionsnummeret ikke bevis på et identisk projekt. En Web Worker validerer og serialiserer det aktuelle projekt på samme måde som renderen og beregner SHA-256; først når den matcher manifestet vises en præcis match-besked. Manglende worker giver en tydelig begrænsning og bevarer downloads. Arbejdet har en frist på 15 sekunder og afbrydes ved lukning/ændring; færdige hashes caches svagt per uforanderligt projektobjekt.

Poll af aktiv render er nu sekventiel med ti sekunders frist per statuskald. Skift til et andet job afbryder det tidligere kald. Et sent statusrespons eller et sent svar fra genindlæsning kan ikke overskrive brugerens nyere valg. Historikkens egen netværksfejl bevarer sidste gode liste og tilbyder genkontrol.

## Lokal opbevaring og grænser

Der sker **ingen automatisk sletning**. Arkivet bor på render-serverens disk, i `.director-render` under appens arbejdsmappe eller i den eksplicit konfigurerede `DIRECTOR_RENDER_DIR`. Det følger denne server, også efter browserdata er ryddet. JSON/ZIP i browseren er ikke en backup af de lokale renderjobs.

Der er højst 100 optagede jobpladser i rendermappen, og ny render kræver mindst 512 MiB ledig disk ved start. Listen viser både antal og den aktuelle frie plads. Dette er en antalsgrænse og en kontrol før start, **ikke** en reservation af diskplads eller en samlet bytekvote. Segmenter, inputmanifest og film kan optage mere end slutfilen alene; ingen garanti gives for en bestemt opbevaringstid eller diskstørrelse.

Hvis pladsgrænsen nås, stands først den lokale server og sikre dig, at ingen render kører. Kopiér/arkivér hele færdige jobmapper til eget lager og verificér filernes hashes før en manuel flytning ud af rendermappen. Bevar status, manifest og sidecars sammen med filmen; checkpoints/segmenter er nødvendige for genoptagelse. Appen udfører ikke denne flytning eller sletning automatisk.

## Reproduktion

```sh
node --import tsx apps/director/tests/render-history-smoke.mjs
HISTORY_ENGINE=chromium node --import tsx apps/director/tests/render-history-ui-flow.mjs
HISTORY_ENGINE=firefox node --import tsx apps/director/tests/render-history-ui-flow.mjs
HISTORY_ENGINE=webkit node --import tsx apps/director/tests/render-history-ui-flow.mjs
```

Den native gate renderer tre rigtige MP4-filer i en privat midlertidig mappe, bekræfter projektfiltrering og uændret gammel film, tester legacy-/korrupt-/symlink-/byttet-id-/oversize-status og afviser en ændret filmhash. UI-gaten eksporterer to faktiske klipninger med samme id/revisionsnummer og forskellig dialog, verificerer ægte download-hashes/filnavne, tilbageholder og frigiver et faktisk statusrespons efter et andet eksportvalg, afprøver genindlæsning, forkert projekt-id, cross-site, netværksfejl og worker-fejl. Screenshot og axe ved desktop/tablet/telefon suppleres med assertions for terminerede workers.

Native watchdog: 120 sekunder; browser: 240 sekunder. CI kan sætte henholdsvis tre og fem minutter. Evidens ligger i `reports/director/render-history.json`, `*-render-history-flow.json` og `*-render-archive-*.png`.
