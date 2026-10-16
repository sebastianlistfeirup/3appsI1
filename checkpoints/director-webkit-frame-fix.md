# Director: WebKit compositor-frame efter kliptrim

GitHub CI ad60871 på Ubuntu/WebKit viste en reel forkert PDF: røde pixels fra
første frame, selvom HTMLVideoElement stod på sekund fire (det blå segment),
readyState=3/4 og seeking=false. Den præcise inputfil er replayet lokalt.

Fix: vent på faktisk præsenteret native videoframe, mål første frames
presentation-offset, og bekræft det ønskede trim før capture. WebKit/GStreamer
rapporterer i dette klip 0,083333 / 4,083333 i callbackens mediaTime; currentTime
står korrekt på 0 / 4. PDF-manifestet medtager begge observerede tidsværdier.
Ingen tidsbaseret sleep eller afspilning anvendes som bevis.

Checks: typecheck og produktionsbuild; 2 PDF-units; hele storyboard-flow på
Chromium, Firefox og WebKit med præcis CI-input. Udvidet flow tjekker otte
separate varme/kolde elementer, rød/blå sekvens og sourceIn=0,1,24,48,96 med
rigtige JPEG-pixels og uændrede projektdata. Eksisterende blå-pixelassertion,
lang tekst, manifesthashes og versionsassertions bevares.

ZIP/worker-arbejdet er midlertidigt parkeret i separat stash og genoptages
efter integration af dette afgrænsede P0-fix.
