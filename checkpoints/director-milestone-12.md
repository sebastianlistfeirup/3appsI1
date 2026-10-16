# Director — milestone 12: hele replikker og faktisk eksportkvalitet

Status: LOCAL_DEMO. Ingen taleadapter, cloud, betaling eller genereringskald.

Fundet og rettet: MP4-koden beholdt kun de første tre linjer af en replik.
Hele teksten opdeles nu i højst to linjer pr. cue og fordeles på heltalsframes.
Crossfade overtager teksten ved midtpunktet; browserpreview, MP4, SRT og VTT
anvender samme plan. Læseadvarsler er synlige før eksport, og umulig timing
afvises frem for at miste indhold. Aktuelle SRT/VTT-filer kan hentes i browseren.

Færdige renders giver hashkontrollerede, låste undertekster og kvalitetsrapport.
Rapporten viser faktisk LUFS, true peak og 48 kHz AAC, registrerer rigtig
stilhed og identificerer kildens titel/revision. Efter redigering angiver UI,
at download bevarer den tidligere klipning. Loudness normaliseres ikke automatisk.
En fundet recovery-svaghed er også rettet: assembly-genbrug kræver nu både
format, SHA-256, manifesthash og pipelineversion.

Verificeret: 67 units, TypeScript og produktionsbuild. En rigtig 11,5 sekunders
MP4 med syv cues afkodes til 21 start/midte/slut-frames; uafhængige tegnmasker
matcher over 96 %, inklusive den tidligere mistede sidste sætning og crossfade.
Separat AAC-måling matcher præcis −17,3 LUFS / −16,6 dBTP. Samme gate bestod
med faktiske FFmpeg 7.1.5- og Ubuntu 6.1.1-binaries. Stilhed, sidecar-tampering,
traversalafvisning, gyldigt genbrug og en formatkorrekt men hashændret assembly
er også afprøvet med reelle filer.

Chromium, Firefox og WebKit består hver previewgrænser, komplette SRT/VTT,
en faktisk 3,5 sekunders UI-render og browserafkodning af den downloadede MP4,
rapporthashes samt låst tekst efter nye redigeringer og reload. 18 responsive
axe-scans giver nul fund. Desktop/tablet/mobile-screenshots er inspiceret.
Den nye 60-sekunders sample-MP4 er produceret og ffprobe-kontrolleret. SIGKILL-
recovery genbruger stadig præcis to validerede segmenter og producerer 59,5 s.
Clip-audio-gaten giver faktisk PCM RMS 0,088 med kliplyd og 0 uden.

Afgrænsning: timings fordeles ud fra tekstlængde, ikke talegenkendelse. Meget
hurtig dialog kræver redaktionel tilpasning. DejaVu Sans begrænser indbrændingens
glyphdækning; UTF-8-sidecars og kildemanifestet bevarer Unicode. MP4 er fortsat
en animatic/klipsekvens, ikke kontinuerlig 3D-kameraanimation.

Bevis: reports/director/caption-render.json, *-captions-flow.json,
complete-dialogue-720p.mp4, complete-dialogue-last-frame.png,
sample-ffprobe.json og recovery.json. Reproduktion og profilgrænser står i
docs/director-captions.md og docs/director-verification.md.
