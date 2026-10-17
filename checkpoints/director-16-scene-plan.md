# Director checkpoint 16 — direkte sceneplacering og afbrydelige bevægelser

Skrevet: metrisk 2D-editor med objekt-, kamera- og sigtepunktsgreb, pointer-capture, piletaster, 0,1 m/1 m trin, panorering, zoom og indramning af alle objekter. Én afsluttet bevægelse giver én undo-/projektændring. Nye planframes har den selvstændige rendererprofil `director-plan-2.0`; tidligere frames og alle låste versioner bevares.

Udført: native capture uden for SVG, multi-move preview uden IndexedDB-write, enkelt Fortryd/Gentag, gentaget tastaturinput, retur til udgangspunkt, Escape/Ctrl-Z/pointercancel/capture-loss samt afmontering midt i en bevægelse. Kamera og sigtepunkt ændrer faktiske transforms/quaternions. Chromium har også trusted touchStart/Move/End/Cancel via inputprotokollen. Den fjerne figur på X=100 m er synlig i det faktiske afkodede 1280×720 JPEG (638 relevante farvepixels i højre billedområde).

Verificeret: 77 units, typecheck og produktionsbuild. Hele planforløbet er grønt i Chromium, Firefox og WebKit; 9 responsive axe-scans giver nul WCAG 2 AA/2.1 AA-fejl. 9 screenshots ved 1440×900, 1024×768 og 390×844 samt 3 faktiske plan-JPEGs er inspicerbare under reports/director. Den eksisterende komplette cross-browser-gate er gentaget: 6/6 native/WebGL-fallback-forløb grønne. Ingen pageerrors.

Afprøvningen fandt to reelle afbrydelser: capture på markører er sårbar ved DOM-omplacering; capture ejes nu af det stabile SVG, og markørernes DOM-rækkefølge ændres ikke. ResizeObserver kunne annullere WebKit-keyrepeat, når hjælpeteksten ændrede højde; hjælpetekstens plads er nu stabil, og metrisk tastaturbevægelse tåler resize. Et træk tilbage inden for startpunktets tærskel nulstiller forhåndsvisningen i stedet for at beholde sidste mellempunkt.

Tilkoblet: browserens native SVG/PointerEvents, Three-scenen, IndexedDB og faktisk frame-eksport. Der påstås ikke fysisk touchhardware-test, præcise GLB-fodaftryk, kollisionsdetektion, karakteranimation eller cloud. CI: `PLAN_ENGINE=<engine> node apps/director/tests/plan-flow.mjs`, 4 minutter ydre deadline; scriptet har selv 180 sekunder og bounded cleanup. Serverens render-opt-in/FFmpeg/lydserver er ikke påkrævet til denne gate.
