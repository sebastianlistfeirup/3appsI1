# Director: egne set og procedurelle locations

**Vælg set** i kameraværktøjslinjen åbner samme editor på computer, tablet og mobil. Vælg observationsdækket, lysstudiet med en sammenhængende buet bagvæg eller gårdrummet med buegang og planter. Navn, gulvfarve og baggrundsfarve kan tilpasses; **Brug dette set** anvender ændringerne. Lukning af dialogen uden dette valg bevarer scenen uændret.

Settene er faktisk 3D-geometri med lys og skygger, genereret lokalt. De bruger ingen eksterne billeder, modeller eller AI-kald. Kortenes originalbilleder er renderet af Director selv og kan genskabes med `node apps/director/tests/generate-location-previews.mjs`. Kortene viser eksempler med sample-cast; cast og kamerakomposition i en eksisterende film bliver på deres pladser, når settet ændres.

En ny tom produktion starter i et neutralt lysstudie. Den eksisterende sample og tidligere projektfiler beholder observationsdækket. Miljø, navn og palette er en del af sceneversionen. Ændringer markerer kamerashots i kontinuitetsvisningen, og nye frames låses til den nye scene. Tidligere scenesæt og billeder bevares. Eget billed-/videomateriale følger fortsat sin egen kilde.

2D-planen viser det valgte sets navn og orienteringspunkt. Den kan gemme reelle, tydeligt markerede 2D-kameraframes, når WebGL ikke er tilgængelig. Den er en skematisk topvisning; den simulerer ikke det rumlige 3D-perspektiv. JSON, ZIP og PDF-manifest medtager den versionerede sceneprofil.

Den nuværende profil har ét redigerbart set ad gangen, mens forskellige immutable sceneversioner kan bruges i samme film. Egne statiske GLB-modeller kan supplere geometri og rekvisitter. Der er endnu ikke et delt cast-/locationbibliotek mellem produktioner.

```sh
LOCATION_ENGINE=chromium node apps/director/tests/locations-flow.mjs
LOCATION_ENGINE=firefox node apps/director/tests/locations-flow.mjs
LOCATION_ENGINE=webkit node apps/director/tests/locations-flow.mjs
```

Forløbet kontrollerer staged valg uden mutation, alle tre originale thumbnails, farveændring/nulstilling, bevarede transforms og historiske versioner, faktisk nyt 3D-frame i Chromium, eksplicit 2D-plan/frame, genåbning, ZIP og afvist ugyldig sceneprofil. Seks axe-scanninger pr. browser dækker responsive dialoger, de to nye set og tastaturvalg i den interaktive 2D-plan.
