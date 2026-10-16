# Director: store originale billeder i biblioteket

Biblioteket læser én IndexedDB-record pr. cursortransaktion. Det validerer
projektet, laver et 384 × 216 JPEG-cover fra første aktive shot og frigiver
billedets object URL, før næste projekt læses. Egne video-shots får ikke et
misvisende gammelt kameraframe som cover. Opsummeringerne indeholder aldrig
originale data-URL'er; et cover har højst 65.536 tegn inklusive data-URL-præfiks.
Der anvendes ingen `getAll()` over filmbiblioteket.

Billedheaders kontrolleres før decode (PNG/JPEG, højst 8192 pixels pr. led og
32 megapixels). Decode har fem sekunders frist. Et beskadiget cover skjuler
ikke filmen eller dens sikkerhedskopi. Ny opdatering og navigation afbryder
igangværende læsning/decode og frigiver ressourcer, også i browsere uden
BroadcastChannel. Originale medier og projektrevisioner ændres aldrig for at
lave covers. En enkelt stor film skal stadig kunne rummes i browserens lager
og hukommelse; dette er ikke en generel garanti for ubegrænsede biblioteker.

`large-library-flow.mjs` genererer tre ægte 1536 × 1536 PNG-originaler med
seedet støj (>20 MB samlet), samt et beskadiget lokalt billede. På Chromium,
Firefox og WebKit kontrollerer testen bounded coverstørrelser, én samtidig
billed-URL, oprydning, afbrydelse ved navigation, uændrede dokumenthashes og
fuld original i sikkerhedskopien. Den stopper med diagnostik efter højst
180 sekunder; browseroprydning har fem sekunders frist.
