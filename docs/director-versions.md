# Director: klipninger og kontinuitet

En gemt klipning låser rækkefølgen af immutable shotversioner, deres kameraframes eller mediekilder, trim, varigheder, overgange, lydspor og undertekster. **Sekvensversioner** ved tidslinjen gemmer den aktuelle klipning med et navn. Den kan gendannes uden at ændre arbejdsscenen. Hvis den aktuelle klipning endnu ikke findes i historikken, gemmes den automatisk før gendannelsen.

**Shotversioner** i inspector viser den aktuelle og en tidligere indstilling ved siden af hinanden. “Brug … som en ny shotversion” opretter en ny version i samme historik; tidligere billeder, noter og scenehenvisninger overskrives aldrig. Et duplikeret shot starter en selvstændig historik. Ældre projektfiler uden eksplicitte forgængerlinks kan åbnes; appen opfinder ikke relationer mellem deres gamle shots.

**Sceneversioner** viser berørte kamerashots og lader brugeren vælge præcis hvilke indstillinger, der skal følge arbejdsscenen. Egne billeder og klip følger deres mediekilde og er udelukket fra sceneopdateringen. Alle valgte kamerashots låses til samme nye sceneversion. Fravalgte shots beholder den gamle.

Når shots flyttes eller fjernes, bliver en overgang, der ikke længere kan være mellem sine nye naboer, kortere. Første shot får ingen indgående overgang. Hver ændret overgang skaber en ny shotversion, så en gemt tidligere klipning kan gendannes præcist. Den samlede 120-sekunders grænse kontrolleres også efter flytningen; en afvist handling ændrer ikke projektet.

JSON/ZIP medtager hele historikken. Import validerer også de klipninger, der ikke er aktive, herunder manglende referencer, gentagne shot-id'er, ugyldige overgangslængder og lydtrim. Storyboardets vedhæftede manifest indeholder den matchende gemte klipning og forgængerlinks. Lokal MP4-eksport kopierer den samme klipning ind i et låst, SHA-256-identificeret rendermanifest; efterfølgende redigering ændrer ikke eksporten.

## Grænser

Den lokale profil har højst 40 gemte klipninger, 200 shotversioner, 100 sceneversioner og 30 aktive shots. Historik slettes ikke automatisk. Ved fuld kapacitet bevares den aktuelle tilstand og kan eksporteres. Gendannelse af et gammelt shot kan blive afvist, hvis dets trim eller overgange ikke passer ind i den aktuelle klipning; den tidligere gemte hele klipning kan stadig gendannes. Der er endnu ingen selektiv historikoprydning eller cloud-review.

## Reproducerbar kontrol

```sh
pnpm exec vitest run packages/scene-format/src/history.test.ts
VERSIONS_ENGINE=chromium node apps/director/tests/versions-flow.mjs
VERSIONS_ENGINE=firefox node apps/director/tests/versions-flow.mjs
VERSIONS_ENGINE=webkit node apps/director/tests/versions-flow.mjs
node --import tsx apps/director/tests/sequence-render-smoke.mjs
```

Browserforløbet kontrollerer selektiv kontinuitet, uændrede historiske poster, egen billedkilde, gemt og automatisk bevaret klipning, lydgenoprettelse, duplikering, shot-sammenligning, genåbning, ZIP og afvisning af skadede historikreferencer. Seks tilgængelighedsscanninger pr. motor omfatter desktop/tablet/mobil. Det virkelige FFmpeg-forløb ændrer kalderens projekt efter låsning og beviser, at manifest-hash, shotrækkefølge og 84 frames / 3,5 sekunders 720p24-film forbliver uændret. Eksporten er stadig en animatic/klipsamling, ikke kontinuerlig 3D-animation.
