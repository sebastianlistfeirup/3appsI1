# Director: hele replikker og målbar eksportkvalitet

Replikker opdeles i tekstblokke på højst to linjer med 42 Unicode-graphemer
pr. linje. Ingen afslutning slettes for at passe ind i en fast tekstboks.
Hver blok får mindst én hel billedframe; tiden fordeles efter tekstlængde.
Ved et crossfade overtager det nye shots tekst ved overlappets midterste
frame. Samme plan anvendes i browserpreview, SRT, WebVTT og MP4. MP4 bruger
faste numeriske framegrænser og tekstfiler med FFmpeg-expansion slået fra;
brugertekst bliver aldrig et filterudtryk. Replikker genkendes eller tilpasses
ikke automatisk fra et indlæst lydspor.

Under ét sekund pr. blok eller over 20 tegn/sek. vises som læseadvarsel.
Hvis der er flere blokke end billedframes, afvises indbrænding og subtitle-
download med en konkret besked om varighed. Brugeren kan forlænge shottet
eller eksportere MP4 uden indbrænding. Langsom læsning og pauser kræver stadig
redaktionel gennemgang. Indbrænding anvender den installerede DejaVu Sans;
sjældne glyphs/emoji kan være uden for fontens dækning. SRT/VTT og den rå
tekst i `captions.json` bevarer Unicode uanset font. Markuptegn escapes i
subtitle-filerne, og replikternes oprindelige whitespace bevares i JSON-kilden.

Det aktuelle klip kan hente SRT/VTT direkte i browseren. En færdig MP4 har
separate låste SRT/VTT-filer, et cue-/kildemanifest og en kvalitetsrapport.
Status registrerer kildens titel, revision, manifesthash og hver filhash.
Senere redigering ændrer ingen af disse downloads; editoren viser tydeligt,
når den åbne film har ændret sig siden eksporten. Filnavne er en fast allowlist,
og serveren kontrollerer filernes længde/hash på hver download.

Kvalitetsrapporten måler 48 kHz AAC, faktisk varighed, fps, codec, EBU R128
integreret loudness og true peak på den færdige fil. Ren stilhed vises som
stilhed med negativt uendeligt peak, frem for en misvisende LUFS-værdi alene.
Samplelimiteren garanterer ikke et bestemt peak efter AAC-kodning; resultater
over −1 dBTP markeres. Der udføres ingen automatisk −16 LUFS-normalisering.

`caption-render-smoke.mjs` bruger en 11,5 sekunders rigtig H.264/AAC-eksport,
lang dansk/græsk/kyrillisk replik og bogstavelige filter-/markuptegn. Start,
midte og slut af alle syv tekstblokke afkodes til 21 faktiske videoframes og
sammenlignes med uafhængigt rasteriserede tegnmasker; alle har over 96 %
overlap. En separat EBU R128-måling giver præcis samme LUFS/true peak.
Et andet job beviser rigtig stilhed. Testen beviser også genbrug af uændrede
mellemresultater, genrendering af en formatkorrekt men hashændret assembly
og afvisning af ændrede sidecar-bytes/traversalnavne. Den er kørt med både
Debian FFmpeg 7.1.5 og de isolerede faktiske Ubuntu FFmpeg 6.1.1-binaries.

`captions-ui-flow.mjs` kontrollerer de faktiske previewgrænser, hele SRT/VTT,
en rigtig 3,5 sekunders UI-eksport, browserens afkodning af den downloadede MP4,
rapporthashes, låst tekst efter nye redigeringer og genindlæsning samt seks
responsive axe-scans pr. browser. Ingen tale-/genereringsadapter tilkobles.
