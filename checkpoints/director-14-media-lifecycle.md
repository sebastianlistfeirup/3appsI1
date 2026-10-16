# Director checkpoint 14 — afbrydelse og native ressourcefrigivelse

Skrevet: afbrydelig FileReader/import, fælles tidsfrister, afbryd-knap i korrekt dialogfokus, native medie-/billedoprydning, disposal af sene GLB-resultater, afbrydelig sceneindlæsning og idempotent lukning af lydgrafen. Storyboardbilleder/canvas frigives også på fejl.

Udført: nye forløb på faktisk H.264/AAC og tekstureret GLB. Metadata tilbageholdes efter native decode; et ægte ImageBitmap forsinkes for at bevise oprydning af det sene parse-resultat. Efter afbrydelse og timeout er projektet identisk; samme medie kan importeres igen. Fire preview-monteringer efterlader ingen afmonteret afspiller eller kilde, og skift til produktioner lukker AudioContext.

Verificeret: 70 domæne/app-units, TypeScript og produktionsbuild. Tre motorer gennemfører nyt tastatur-/cancel-/timeout-/late-GLB-/preview-forløb med ni responsive axe-scans uden fejl. Alle ni eksisterende tekstur-, storyboard- og medieforløb er også grønne på Chromium, Firefox og WebKit, inklusive faktisk MP4, PDF-pixels, korrupt tekstur, ZIP-roundtrip, kliptrim, voiceover, ducking og billedovergange. Se rapporter i `reports/director` og `docs/director-media-lifecycle.md` for præcise grænser.

Tilkoblet: native browsermedier og lokal FFmpeg. Ingen ekstern medietjeneste. Three.js' native parse kan ikke præemptes; sene afsluttede resultater destrueres i stedet. Ressourceassertions måler eksplicit oprydning, ikke OS-RAM eller garbage collection.
