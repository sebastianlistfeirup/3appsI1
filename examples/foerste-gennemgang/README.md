# En analyse, en film og dit første review

[Hent prøvepakken](tre-apps-review.zip), og åbn Studio One på `http://localhost:3000`. Under **Produktioner → Importér projekt** vælger du ZIP-filen. Du får en selvstændig produktion med to leverancer klar til din vurdering. Ingen reviewbeslutning er truffet på forhånd.

1. Åbn **En ekstra sagsbehandler** under Leverancer. Vælg fanen **Filer**, og hent FlowLab-rapporten. Den er beregnet med 30 faktiske parrede seeds på den aktuelle motor. JSON-filen indeholder samme grundlag. Se både tider, restkø, løn og begrænsninger. Data er syntetiske; der er ikke gennemført holdout.
2. Åbn **Det sidste signal**. Hent den faktiske 60-sekunders MP4 og storyboard-PDF. Filmen er 1280×720, 24 fps H.264 med 1.440 videoframes. Eksemplets AAC-spor er stille. Det er en animatic med stillbilleder, ikke kontinuerlig 3D-animation. Brug din egen musik eller voiceover i Director, når du laver din film.
3. Afkryds kun de krav, du selv har gennemgået, og skriv en vurdering. Acceptér eller bed om en rettelse. Prøvepakkens kontrolpunkter er mærket som eksempeldata.
4. Efter accept af begge leverancer kan du starte **Vælg dit næste rigtige forsøg**. Beskriv én afgrænset ændring og en observation, der skal afgøre, om den er nyttig. Hent en ny projektpakke, når du vil bevare dit arbejde.

Filerne er flyttet manuelt mellem produkterne. Pakken opretter ingen cloudforbindelse og ændrer ikke dine andre projekter. En genimport tilbyder en selvstændig kopi. Det eksisterende Realmread-eksempel bevares.

## Åbn og redigér originalerne

- **FlowLab:** Hent [den redigerbare modelpakke](flowlab-modelpakke.json). I FlowLab åbner du **Modelbibliotek → Importér modelpakke**. Den indeholder den samme baseline, kapacitetsændring, seed og beslutningstekst som analysen. Resultater følger ikke med som en forhåndsgodkendelse: Appen beregner de 30 par igen. Import erstatter det åbne arbejdsrum med mulighed for Fortryd; hent først din egen model med **Eksportér arbejdsrum**, hvis du allerede har arbejdet i appen.
- **Director:** Hent [den originale projektpakke](../../reports/director/sample-project.zip). Åbn **Director · produktioner → Importér projekt som ny film**. Scenen, de fem kameraer og de fem shots åbnes som en selvstændig film. Prøv at ændre et kamera, optage en ny version og sammenligne den med det låste shot. Pakken er kontrolleret mod den faktiske kilde til eksempelrenderen.

Du kan arbejde videre uden at ændre de allerede afleverede filer i Studio. Når du har et nyt resultat, afleverer du en ny version og gennemfører et nyt review.

[Manifestet](manifest.json) angiver filstørrelser, SHA-256, generator, motor-/PRNG-version og de faktisk målte filmdata. Den indre Studio-ZIP har også sit eget manifest og kontrolleres ved import.

Pakken kan regenereres fra repositoryets rod med `pnpm exec tsx tools/demo/create-review-package.ts`. Det kræver de installerede projektdependencies og `ffprobe` på PATH. Generatoren kører en ny virkelig FlowLab-beregning, bruger de originale Director-filer, måler MP4’en og verificerer projektets eksport/import med alle originale bytes. Den kontrollerer også FlowLabs redigerbare input og Directors projektpakke mod renderkilden. Den skriver nye tidsstempler og projekt-id’er; det er samme numeriske eksempel, ikke en garanti om byteidentisk ZIP.
