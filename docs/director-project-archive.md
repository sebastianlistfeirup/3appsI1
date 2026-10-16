# Director: portable projektpakker med originale filer

Komplet projektpakke eksporterer ZIP-format v2. Den indeholder `manifest.json`,
`project.json` og binære originaler under `assets/<sha256>`. Metadata henviser
kun til indlejrede, deklarerede filer. Identiske bytes gemmes én gang, også når
flere immutable sceneversioner bruger samme GLB eller flere shots samme frame.
En version omskrives aldrig i det gemte projekt; referenceformatet findes kun
i den portable pakke. Originalernes SHA-256, metadata og rettighedsangivelser
bevares. Både editoren og filmbiblioteket kan stadig åbne det tidligere v1-format
med indlejrede data-URL'er. Import i biblioteket opretter en uafhængig film.

Hashkontrol, GLB-kontrol, pakning og udpakning kører i en rigtig bundlet
Dedicated Worker. Import overfører ZIP-bufferen til workeren; eksport
overfører den færdige ZIP-buffer tilbage. UI viser fremdrift og tilbyder
afbrydelse. Afbrydelse, navigation, fejl og en frist på 60 sekunder terminerer
workeren. En afbrudt eller afvist import ændrer ingen film. Browserens reelle
GLB-billeddecode kontrolleres fortsat efter baggrundsvalidering og før lagring.

Grænserne er 100 MiB ZIP, 150 MiB rekonstrueret projekt-JSON, 151 MiB samlet
udpakning, 16 MiB v2-metadata, 1 MiB manifest, 50 MiB pr. original og højst
1.250 originaler. Den rekonstruerede størrelse medregner hver reference: en
lille fil med meget mange henvisninger kan ikke omgå loftet. ZIP-navne,
duplikater, deklarerede/brugte filer, længder, SHA-256 og medietyper kontrolleres.
Ingen URL hentes, og arkivnavne skrives aldrig til filsystemet. Deduplikation
erstatter ikke browserens lager- eller hukommelsesgrænser. Meget store
projekter kan stadig kræve rå Projekt-JSON som recovery-kopi; den kan hentes
fra hukommelsen, selv når den seneste lagring fejler. JSON er ikke workerbaseret.

`archive-flow.mjs` kører mod produktionsbuildet på Chromium, Firefox og WebKit.
Den bruger to ægte 1536 × 1536 PNG-originaler (>15 MB), et tekstureret GLB,
gentagne scene-/frameversioner og en navngiven historisk klipning. Den kræver
fire unikke originale filer, korrekte binære hashes, fuld semantisk roundtrip,
uændrede oprindelige film, aktiv hovedtråd, faktisk workerterminering, v1-import
og afvisning af ændrede bytes samt kontrolleret worker-startfejl. Tre
responsive ventetilstande har axe-scans og screenshots pr. browser. Processen
har 240 sekunders watchdog og fem sekunders browseroprydning.

Modalens dekorative fuldskærmsblur er fjernet efter reproduceret meget høj
SwiftShader-belastning ved store originale billeder. Med den mørke overlay
alene kørte hele arkivforløbet på 15–19 sekunder i de tre lokale browsere;
de målte største hovedtrådsgab under eksport var 37–56 ms. Dette er konkrete
lokale målinger, ikke en generel ydelsesgaranti for alle enheder.
