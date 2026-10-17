# Kom i gang med Director

Director er et lokalt filmværksted til storyboard og korte animatics: byg et set, vælg kamerabilleder, klip dem sammen med egne medier, og eksportér en film. Arbejdet gemmes automatisk i den browser, du bruger. Der er ingen tilkoblet AI, konto, cloudsynkronisering eller betaling i denne profil.

## Start og første film

Fra repositoryets rod kræves Node ≥22.12 og den fastlåste pnpm-version. Kør:

```sh
pnpm install --frozen-lockfile
pnpm dev:director
```

Åbn **http://localhost:3002**. Brug samme adresse og browserprofil fremover: forskellige adresser/profiler har hver sit lokale lager. Første åbning viser samplefilmen _Det sidste signal_, med fem shots og 60 sekunders klipning. Via **Produktioner** åbner du biblioteket. Giv din egen film en titel, vælg **Tomt filmstudie** eller samplefilmen som udgangspunkt, og tryk **Opret film**. Bibliotekets import opretter en ny film og bevarer de eksisterende.

Vent på **Gemt lokalt**, før du lukker. Det er browserlagring, ikke en sikkerhedskopi. Hent regelmæssigt en projektpakke til en mappe, du selv sikkerhedskopierer.

## Byg scenen og gem dine indstillinger

Vælg **Vælg set**: station, gårdrum eller lysstudie. Farver og navn kan justeres; **Brug dette set** anvender valget. Figurer og kameraer bevares, når du skifter set. I objekt- og kamerapanelerne ændrer du placering, størrelse, drejning, linse og lys.

**2D-plan** giver direkte placering: vælg **Flyt objekter** eller **Placér kamera**, og træk markørerne. Piletaster flytter 0,1 meter; Shift flytter 1 meter. Escape annullerer et igangværende træk. Én Fortryd gendanner hele flytningen. Baggrunden kan panoreres, og **Vis hele settet** indrammer objekter og kamera. Planen er symbolsk; den viser ikke præcise modelkonturer eller kollisioner. Uden WebGL bruger appen automatisk denne plan.

Opret eller vælg et shot, indstil kameraet, og tryk **Gem indstilling**. Nu låses et rigtigt billede til netop den scene- og kameraversion. En senere flytning i arbejdsscenen ændrer ikke dit allerede gemte shot. **Gem sceneversion** gemmer scenen uden at udskifte filmens billeder.

Under **Sceneversioner** — **Versioner** på mobil — kan du se berørte shots. **Sammenlign** viser det låste billede og en faktisk kandidat fra arbejdsscenen, med en liste over ændringer. Vælg kamerabillede eller 2D-plan og godkend kun det ønskede shot, eller markér flere shots til opdatering. **Shotversioner** kan gendanne en tidligere indstilling. Tidligere versioner bevares. [Læs om sceneplacering](director-scene-plan.md) og [visuel kontinuitetskontrol](director-continuity-review.md).

## Klip fortællingen

Vælg et shot i storyboardet eller tidslinjen. I shotpanelet ændrer du navn, varighed, replik og instruktørnote. **Tidligere / Senere** ændrer rækkefølgen. Vælg rent klip eller crossfade i **Overgang ind i shot**. Overlap forkorter filmens samlede spilletid; den viste varighed tager højde for det. Det første shot har ingen indgående overgang.

**Afspil sekvens** viser de gemte frames og egne klip. Scrubberen lader dig kontrollere bestemte tidspunkter. **Sekvensversioner** gemmer en navngiven klipning med dens præcise shotversioner og lydindstillinger, så en tidligere udgave kan genoptages. Fortryd/Gentag er hjælp under den aktuelle session; gemte versioner og projektkopier er den varige historik.

## Egne medier, lyd og tekst

**Importér billede eller klip** tilføjer PNG/JPEG eller MP4/WebM til det valgte shot. Videoklippets start trimmes i **Klipstart i sekunder**, og shotvarigheden bestemmer det anvendte udsnit. **Brug klippets lyd** aktiverer dets originale lyd; indstillingen er slået fra som udgangspunkt.

**Tilføj lyd** åbner import af din egen voiceover eller musik. Klik på lydsporets navn for at justere **Start på tidslinje**, **Start i lydfil** og fade ind/ud. Niveauet styres på tidslinjen. Musik kan automatisk sænkes under voiceover. Lyden slutter ved kildens eller filmens slutning. Der er ét voiceoverspor og ét musikspor; ingen optagelse eller talesyntese er tilkoblet.

Angiv materialets rettigheder ved import. Hver fil må højst være 50 MiB, og browseren skal kunne afkode det valgte medie. Statiske GLB-modeller kan importeres med indlejret geometri og PNG/JPEG-teksturer op til 2K; rigs, animation, eksterne filer og kompression understøttes ikke i denne profil. [Se de præcise importgrænser](director-imports.md).

Skriv teksten i **Replik / voiceover**. **Vis replikker som undertekster** i eksportdialogen bruger hele teksten som tidsinddelte tekstblokke. Appen viser advarsler ved for høj læsehastighed. Teksten synkroniseres ikke automatisk med tale. SRT og VTT kan hentes separat. [Læs om tekst og lydmålinger](director-captions.md).

## Eksport og sikkerhedskopi

**Eksportér** tilbyder disse lokale filer:

- **Storyboard:** rigtig PDF med billeder, replikker, noter og versionsreferencer. Et eget videoklip får et billede fra det valgte starttidspunkt.
- **Komplet projektpakke:** ZIP med projekt, historik og originale medier. Identiske filer gemmes én gang, og deres hashes kontrolleres ved import. Bedst som flytbar sikkerhedskopi.
- **Projekt-JSON:** fuld projektkopi med indlejrede medier. Denne kopi kan også hentes fra hukommelsen ved lagringsfejl.
- **SRT / VTT:** undertekster for den aktuelle klipning.
- **720p animatic:** rigtig H.264/AAC MP4, når den lokale renderprofil er aktiveret og består sin værktøjskontrol.

For MP4 installeres FFmpeg/ffprobe med H.264/AAC, de dokumenterede filtre og DejaVu Sans. Start derefter Director med eksplicit opt-in:

```sh
DIRECTOR_LOCAL_RENDER=1 pnpm dev:director
```

Serveren skal forblive bundet til localhost. Denne profil er ikke et offentligt renderendepunkt. Eksporten låser et projektsnapshot og validerer den færdige films opløsning, fps, varighed, lyd og hash. **Tidligere eksporter** viser samme produktions lokale jobs; en gammel film bliver ved med at høre til sin oprindelige klipning, selv efter nye ændringer. [Opsætning og recovery](director-local-render.md), [faktisk værktøjskontrol](director-render-profile.md) og [eksportarkiv](director-export-archive.md).

Den aktuelle filmprofil er **1280×720, 24 fps, højst 30 shots og 120 sekunder**. MP4 er timede stillbilleder kombineret med egne videoklip og lyd. Bevægelser i 3D-editoren bliver ikke til kontinuerlig 3D-animation. Browserafspilning er en interaktiv gennemgang; den validerede MP4 er eksportresultatet. Loudness måles, men normaliseres ikke automatisk til en bestemt LUFS-værdi.

## Hvis noget går galt

Ved en afvist fil eller renderfejl bevares projektet. Ret årsagen eller prøv igen. Hvis en anden fane har gemt en nyere version, eller browserens lager er fuldt, så hent først **Gem lokal kopi**. Vælg derefter bevidst **Genindlæs gemt version**. Appen overskriver ikke automatisk den anden fanes arbejde.

Rydning af browserdata, privat browsing og skift af enhed kan fjerne adgangen til lokale film. Importér din gemte ZIP/JSON fra biblioteket for at skabe en selvstændig film. ZIP-kopien inkluderer ikke MP4-eksportarkivet på serverens disk: hent færdige MP4-filer og deres kvalitetsrapporter særskilt. Renderarkivet sletter ikke automatisk filer; der er højst 100 jobpladser og krav om mindst 512 MiB ledig disk ved ny render. [Projektpakkens størrelses- og recoverygrænser](director-project-archive.md).
