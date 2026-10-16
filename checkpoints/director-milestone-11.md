# Director — milestone 11: afbrydelige, deduplikerede projektpakker

Status: LOCAL_DEMO. Ingen eksterne genereringskald, betaling eller cloudforbindelse.

Skrevet: v2 ZIP med SHA-256-adresserede originaler, backcompat v1, faktiske
bundlede workers, fremdrift/afbrydelse, 60 sekunders deadline og ressourcegrænser.
Kun portable metadata omskrives; projektets immutable versioner bevares.
Export kontrollerer egne hashes, så beskadigede medier heller ikke kan pakkes
som tilsyneladende gyldig backup. JSON-recovery forbliver tilgængelig.

Kørt og verificeret: 59 relevante unitcases, typecheck, produktionsbuild,
eksisterende editorflow inklusive komplet GLB/ZIP-roundtrip, samt nyt
arkivflow på Chromium, Firefox og WebKit. Hvert arkivflow eksporterer >15 MB
faktiske originaler, beviser deduplikation til fire filer og fuld semantisk
roundtrip med scener, shots og navngiven klipning. Annullering, korrupt blob,
worker-startfejl og v1-import bevarer eksisterende data. 5/5 oprettede workers
termineres i hver browser. Ni responsive axe-scans giver nul fund.
Eksisterende biblioteksflow er også grønt i alle tre browsere, og de reelle
lagringskonflikt-/kvotegates bevarer den aktuelle recovery-kopi.

Sikkerhedsregressioner dækker blandt andet ændrede/manglende originale bytes,
manifestversion, MIME/reference, dublerede filer, traversalnavne, falske
udpakningslængder og et lille arkiv med alias-ekspansion over 150 MiB.
Rapporter: reports/director/*-archive-flow.json og *-archive-progress.png.
Detaljer og reproduktion: docs/director-project-archive.md og
docs/director-verification.md.

Afgrænsning: ZIP-arbejde sker i baggrunden, men struktureret kopiering af det
åbne projekt og efterfølgende browserdecode kræver fortsat hukommelse.
Projekt-JSON er stadig en rå, synkron recovery-vej. Hele appen er fortsat en
lokal editor; pakkerne etablerer ikke samarbejde eller cloud-lagring.
