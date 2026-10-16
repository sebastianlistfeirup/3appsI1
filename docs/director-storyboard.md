# Portable storyboard exports

The PDF contains a two-shot visual board, full continuation pages when dialogue or notes exceed the card, the production brief and a readable version manifest. Text uses embedded DejaVu Sans fonts, whose redistribution/embedding license is included both in the repository and as an attachment to the PDF. The exporter loads its library/fonts only when requested and processes one poster at a time.

An imported video uses the actual local clip, seeks to `sourceIn / 24`, and draws a decoded poster. It never substitutes a previous camera frame. The shot-strip thumbnail follows the same trim. Browser seeking provides a representative decoded frame at the requested position; exact decode/presentation can differ by browser and source frame rate. The final FFmpeg movie remains independently normalized and frame-count validated.

Chromium, Firefox and WebKit are exercised with a real H.264 file that is red for three seconds and then blue. Export at source frame 96 must contain an actually blue JPEG. The test extracts that JPEG from the PDF, checks its pixel color and SHA-256 against the attached manifest, and checks the full long Danish/Greek/Cyrillic text with Poppler. WebKit required a tiny, noninteractive DOM attachment: a detached video reported `seeked` while canvas reads were transparent. The helper now initializes the real presentation surface and removes it after capture, including on error.

The embedded `director-manifest.json` retains full original text, ordered shot IDs, immutable scene references, camera/lighting/object/asset versions, source hashes, trim/timeline ranges, audio settings and hashes of the actual embedded posters. Original media remain in the separate project ZIP; they are not duplicated into the PDF. Export reads a validated snapshot and never changes the project.

Missing/unreadable posters are explicitly labeled and recorded in the manifest; no unrelated image is substituted. Unsupported font characters appear as explicit Unicode code points, while the original text remains intact in the manifest. The export reports this to the user. These PDFs contain selectable text but are not tagged PDF/UA documents.

```sh
STORYBOARD_ENGINE=chromium pnpm exec node apps/director/tests/storyboard-flow.mjs
STORYBOARD_ENGINE=firefox pnpm exec node apps/director/tests/storyboard-flow.mjs
STORYBOARD_ENGINE=webkit pnpm exec node apps/director/tests/storyboard-flow.mjs
```

The gate needs FFmpeg and Poppler (`pdftotext`, `pdfdetach`, `pdfimages`, `pdftoppm`, `pdfinfo`) and a running local Director server. It does not require the local render API to be enabled.

## Videoframe efter seek

`currentTime`, `readyState` og `seeked` er ikke i sig selv bevis for, hvilket
billede `drawImage(video)` læser. På GitHub Ubuntu/WebKit kunne alle tre være
korrekte ved sekund fire, mens PDF'en stadig fik den røde første frame fra
et klip, som var blåt ved sekund fire. Den præcise fil og native events er
bevaret i `reports/director/ci-webkit-stale-frame-diagnostic.json`; kildefilens
SHA-256 er `dd91c7386a3fddf292c3917f6d14a1b867b83f3c612cb735bf2ed1f80988c31d`.

Posterudtræk venter nu på `requestVideoFrameCallback` for det faktisk
præsenterede billede. Før seek registreres første præsenterede timestamp.
Det er nødvendigt, fordi vores WebKit/GStreamer-profil rapporterer en H264
composition-offset på 0,083333 sekund i `mediaTime`, også ved `currentTime=0`.
Callbacken registreres før `src` sættes, så en varm cache ikke kan præsentere
frame nul før lytteren er klar. Efter seek accepteres kun en ny præsenteret frame ved det ønskede trim relativt
til den målte offset, inden for én projektframe. `seeked` alene udløser ingen
capture. Der afspilles ikke lyd eller startes playback. Deadline og al oprydning
bevares. En browser uden denne framebekræftelse giver et tydeligt manglende
billede/advarsel i PDF'en frem for et forkert kamera- eller klipframe.

PDF-manifestet gemmer `decodedMediaTime` og `presentationOffset` sammen med det
ønskede `sourceFrame` og billedhash. Storyboard-gaten afprøver desuden otte
kolde/varme videoelementer med skiftevis røde og blå trims, inklusive nul og én
frames trim. Den kontrollerer faktiske indlejrede JPEG-pixels, native timestamps,
manifest og uændret projekt. Farvekriteriet skelner rødt fra blåt; det er ikke en
farvekalibrering (Firefox producerer her rød omtrent [254,24,0]). Den oprindelige
blå-pixelassertion er uændret.
