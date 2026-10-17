# Fra Masterbiblens krav til konkrete beviser

Denne oversigt forbinder biblens accept-id'er med den aktuelle implementering. **Lokalt** betyder den browser- eller renderprofil, der følger med repositoryet. **Serverfundament** betyder faktiske lokale HTTP-/database-/workerprøver med begrænsede konti og syntetiske data. Det er ikke en tilsluttet kundesti eller hosted drift.

De oprindelige krav findes i [Studio-biblen](spec/studio.txt), [FlowLab-biblen](spec/flowlab.txt) og [Director-biblen](spec/director.txt). [Aktuel status](../STATUS.md) angiver den seneste samlede CI-kørsel; checkpoints bevarer tidligere fund og rettelser. Testnavne med et accept-id er sporbarhed, ikke i sig selv bevis for, at hele det tilsvarende cloudkrav er opfyldt.

## Studio One

Biblen kræver, at S-AT-cases også virker i den reelle backendprofil. De lokale brugerrejser og det separate serverfundament er derfor angivet hver for sig.

| Krav | Faktisk bevis og resterende grænse |
| --- | --- |
| S-AT01 · gem og genåbn | Den lokale bruger opretter projekt, brief, opgave, fil og review gennem UI og genåbner den accepterede levering. [Browserforløb](../tests/e2e/studio.spec.ts). Den autentificerede server kan oprette/læse projekter gennem rigtig HTTP, men browserens login og synkronisering er ikke tilsluttet. |
| S-AT02 · én logisk bestilling | [Domænet](../apps/studio/src/lib/model.test.ts) deduplikerer manuelle runs. [Databaseprøven](../tests/integration/foundation.test.ts) beviser én reservation og outboxpost ved gentagelser samt afvisning af ændret input. En betalt kodeadapter er ikke tilkoblet. |
| S-AT03 · ingen cyklus | Domænet afviser cykler og referencer på tværs af projekter uden at ændre originalen. [Opgaveforløbene](../tests/e2e/studio-tasks.spec.ts) afprøver afhængigheder, blokering og rettelser i browseren. |
| S-AT04 · låste input og ældre grundlag | Brief, opgavedefinition og valgte filversioner låses ved start. Nye versioner giver en synlig advarsel og kræver ny eksplicit reviewbekræftelse. [Inputpakke](../tests/e2e/studio-work-package.spec.ts), [opgavedefinition](../tests/e2e/studio-task-definitions.spec.ts) og [reviewkladde](../tests/e2e/studio-review-drafts.spec.ts) kontrollerer også genåbning og rettelser. |
| S-AT05 · ukendt providerudfald | [Jobprøven](../tests/integration/processor.test.ts) holder reservationen og sætter `reconcile_required` ved et syntetisk ukendt providerudfald. [Rigtigt processtop](../tests/integration/worker-process.test.ts) er bevist for lokale, gratis handlers. Stop efter faktisk submit til en ekstern leverandør er ikke prøvet. |
| S-AT06 · viewer | [Autentificeret API](../tests/integration/backend.test.ts) tillader læsning og afviser skrivning/jobstart for viewer. Den samlede delivery-/preview-/reviewrejse med en indlogget viewer mangler; den lokale app har ingen rollebaseret brugerflade. |
| S-AT07 · tenant og privat fil | [Filprøver](../tests/integration/artifact-download.test.ts), [uploads](../tests/integration/artifact-upload.test.ts) og [faktisk HTTP](backend-http-proof.md) afviser fremmed identitet og kontrollerer medlemskab igen, også efter udstedelse af et link. Lokal privat lagring er afprøvet; hosted objektlager er ikke tilsluttet. |
| S-AT08 · rettelse bevarer historik | Afvisning opretter en ny opgave og bevarer oprindelige filer, kommentar og levering. Rettelsen låser det faktisk gennemgåede output; efterfølgende uvedkommende versioner overtager ikke grundlaget. [Domæne](../apps/studio/src/lib/tasks.test.ts) og [browser](../tests/e2e/studio-work-package.spec.ts). |
| S-AT09 · bærbar projektpakke | [ZIP-prøver](../tests/e2e/studio-archive.spec.ts) og [samlet backup](../tests/e2e/studio-workspace-backup.spec.ts) kontrollerer originale bytes, SHA-256, relationer, dubletter, afbrydelse og fejl før indlæsning. Formatet eksporterer projektdata, ikke servermiljøvariabler. Brugeren må selv undlade at lægge hemmeligheder i sine egne filer. |
| S-AT10 · budget under samtidighed | [Rigtig PostgreSQL](../tests/integration/foundation.test.ts) serialiserer samtidige reservationer og afstemmer ledger. [Restore](backup-restore.md) bevarer også en uafklaret reservation. Betalingsopkrævning er ikke aktiveret. |
| S-AT11 · faktisk verifikation | Domænet afviser accept af fejlet kontrolbevis. Manuelle kontroller mærkes som manuelle, og den lokale servervalidator angiver eksplicit, at den ikke har kørt kode eller verificeret en ekstern build. Der er ingen tilsluttet kode-/buildadapter, så det fulde agent→fejlet build-forløb er ikke opfyldt. |
| S-AT12 · tilbagekaldt installation | Ikke implementeret som produktintegration. Repositoryet bruges til udviklingen, men Studio har ingen installeret GitHub-adapter at tilbagekalde. Lokalt review og eksport kan bruges uafhængigt af den manglende forbindelse. |

## FlowLab

Den særskilte [FlowLab-audit](flowlab-audit.md) kortlægger FL-AT01–12, numeriske kontrakter, holdout, usikkerhed, faktiske rapportfiler og kendte grænser. Den skelner også mellem den lokale browserworker og den valgfrie [varige serverberegning](flowlab-server-jobs.md).

Den aktuelle rapport kræver en fuldført seedplan og de præcise motor-/PRNG-versioner. Historiske resultater bliver bevaret, men kan ikke bruges som en ny gyldig beslutningsrapport uden den nødvendige genberegning. Hosted tenant-/viewerforløb fra FL-AT11 er fortsat en integrationsopgave.

## Director

Den samlede [slutverificering](../checkpoints/director-20-final-verification.md) dokumenterer 60 beståede lokale gatekommandoer, herunder den konkrete miljørettelse under lydprøven. CI har desuden kørt browserpartitionerne i en frisk Ubuntu-installation.

| Krav | Faktisk bevis og resterende grænse |
| --- | --- |
| D-AT01 · scene og fem kameraer | [Kerneforløbet](../apps/director/tests/cross-browser.mjs) gemmer/genåbner scene og kameraframes i hver browser, også uden WebGL. |
| D-AT02 · 1.440 frames | [Sceneformatets fixtures](../packages/scene-format/src/index.test.ts) og [den faktiske MP4](../reports/director/det-sidste-signal-720p.mp4) beviser 60,000 sekunder ved 24 fps. |
| D-AT03 · 12 frames overlap | [Recoveryfilmen](../reports/director/crossfade-recovered-720p.mp4) måler 1.428 frames og 59,500 sekunder. Metadata og hashes findes i [slutrapporten](../reports/director/final-verification-20261017.json). |
| D-AT04 · gamle shots bevares | [Versionsforløbet](../apps/director/tests/versions-flow.mjs) og [visuel sammenligning](director-continuity-review.md) bevarer låste scene-/shotversioner, mens arbejdsscenen ændres. En ny kandidat kræver eksplicit valg. |
| D-AT05 · rigtig filmfil | [Renderprøven](../apps/director/tests/render-smoke.mjs) kontrollerer faktisk H.264/AAC, opløsning, fps og varighed med ffprobe. Andre gates åbner og måler de faktisk downloadede mediefiler. |
| D-AT06 · genoptag render | [Recoveryprøven](../apps/director/tests/recovery-smoke.mjs) stopper den lokale procesgruppe med SIGKILL og genbruger to validerede segmenter med uændret første mtime. Ekstern generation findes ikke i profilen og er ikke afprøvet. |
| D-AT07 · rettigheder | [Domæneprøven](../packages/scene-format/src/index.test.ts) afviser offentlig brug ved ukendte rettigheder og bevarer privat advarsel. Det er brugerens rettighedserklæring, ikke en automatisk licenskontrol; offentlig deling er ikke tilsluttet. |
| D-AT08 · afgrænset GLB | [Parserprøver](../packages/scene-format/src/glb.test.ts) og [rigtig tekstureret GLB](../apps/director/tests/textured-glb-flow.mjs) kontrollerer indhold og faktisk capture. Ugyldige eller eksterne ressourcer må ikke erstatte den fungerende scene. |
| D-AT09 · uden WebGL | Alle tre browsere kører kerneforløbet med WebGL slået fra. [2D-planen](director-scene-plan.md) understøtter også flytning med mus, berøring og tastatur samt gemte kameraframes. |
| D-AT10 · egen lyd eller stilhed | [Medieforløbet](../apps/director/tests/media-ui-flow.mjs) måler faktisk dekodning, PCM og voiceoverstyret ducking. Brugeren kan uploade egen lyd eller beholde stilhed. Ingen syntetisk tale præsenteres som genereret af en tilsluttet adapter. |
| D-AT11 · tenant/viewer | Ikke opfyldt for Director-produktet. Renderprofilen er lokal og binder til loopback. Det fælles backendfundaments adgangstests er ikke et bevis for et indlogget Director-scene-/kandidat-/renderforløb. |
| D-AT12 · projektets originaler | [ZIP-forløbet](../apps/director/tests/archive-flow.mjs) og [stor JSON-gendannelse](../apps/director/tests/json-recovery-flow.mjs) kontrollerer originale mediehashes, immutable versioner, workerafbrydelse og bevaret projekt ved fejl. |

## Det næste bevis

Den næste milepæl er at forbinde én fuld autentificeret kundesti og efterprøve dens adgang, data, jobs og restore i det valgte driftsmiljø. Den [konkrete integrationsrækkefølge](release-readiness.md) beskriver dette. Ekstern brugertest, betalt privat pilot og faktisk forretningsværdi er endnu ikke målt.
