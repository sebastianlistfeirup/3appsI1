# FlowLab CSV-kontrakt

Dataværkstedet behandler syntetiske CSV-filer lokalt. At gemme en valideret fil er ikke det samme som at kalibrere modellen; medianoverførsel og uafhængigt holdout er særskilte handlinger.

## Læsning og fortolkning

- UTF-8, med eller uden BOM; komma eller semikolon registreres uden for citerede kolonnenavne. Dobbelte anførselstegn følger CSV-escaping. CR, LF og CRLF accepteres som rækkeafslutning.
- Højst 10 MB / 100.000 datarækker / 1.000 kolonner. Hvert kolonnenavn er entydigt, ikke tomt og højst 200 UTF-16-enheder inklusive mellemrum. Rå linjeskift og ASCII-kontroltegn afvises i overskriften.
- Headerlæsningen omfatter den komplette første record inden for en 1 MiB-forhåndslæsning. Alle gyldige headers passer inden for grænsen, også med UTF-8 og escaped quotes. En delvist læst record behandles aldrig som en komplet overskrift. Analyseworker og formular bruger samme læser.
- Formularen viser højst 20 kolonner ad gangen med søgning og sideskift. En skjult tilknytning gælder stadig. Ukendte kolonner udelades, indtil brugeren mapper dem. To kolonner må ikke mappes til samme felt.
- Tidsenheden vælges eksplicit: ISO med tidszone, sekunder eller minutter. Negative, ikke-endelige og usikre numeriske tider afvises. Ingen manglende værdi imputeres.

## Rækker og fejl

ASCII-kontroltegn (`U+0000–001F`, `U+007F`) kontrolleres på de rå mappede felter **før** trimning. Et indledende tabulatortegn eller et afsluttende linjeskift kan derfor ikke forvandles til et tilsyneladende gyldigt id eller tidspunkt. Almindelige ydre mellemrum trimmes. Id'er, sagstyper, aktivitetsnavne og ressourcegrupper må højst være 100 tegn.

Rækker med ugyldigt indhold tælles og viser recordnummer, felt og konkret fejl. Gemning kræver en udtrykkelig accept af udeladelse samt mindst én gyldig række. Kvalitetsrapporten bevarer antallet af samtlige fejl og de første 1.000 fejlbeskrivelser. Et ugyldigt event-id med kontroltegn reserverer ikke et andet, normaliseret id og afviser dermed ikke en efterfølgende gyldig række ved en falsk dublet.

CSV-parseren begrænser hvert afkodet felt til 100.000 UTF-16-enheder, også når feltet kun består af escaped quotes. De første seks rækker vises med højst 240 tegn pr. celle; kontroltegn vises som `\u`-koder, og en synlig advarsel forklarer forkortelsen. Gemte gyldige værdier og renset CSV afkortes ikke.

## Sporbarhed og afbrydelse

SHA-256 beregnes af den originale fil, mens den gemte fortolkning indeholder den eksplicitte tidsenhed og rensede rækker. Renset CSV beskytter formellignende celler ved eksport; originalfilens hash beskriver ikke en genkodet CSV.

Ændring af fil, mapping eller enhed invaliderer en tidligere forhåndsvisning. En erstattet eller afbrudt worker kan ikke skrive et senere resultat ind over ny tilstand. En forsinket fejl under læsning af en gammel fil kan heller ikke erstatte status for den nye fil. Det senest gemte datagrundlag bevares ved fejl og annullering.

## Bevis

- `packages/flow-engine/src/csv.test.ts`: eksakte rækkeudfald, varigheder, parsergrænser, kontroltegn, dubletter, datoer og bounded preview.
- `apps/flowlab/src/lib/csv-header.test.ts`: brede Unicode-headers, 1.000 maksimale navne, UTF-8-grænse mellem kodepunktsbytes, BOM, header-only og beskadigede filer.
- `apps/flowlab/tests/csv-boundaries-check.ts`: rigtig browserworker, >4 KB-header, source hash, skjulte mappings, fejlbeskyttelse, races og downloadet renset CSV i Chromium/Firefox/WebKit på desktop/tablet/mobil.
