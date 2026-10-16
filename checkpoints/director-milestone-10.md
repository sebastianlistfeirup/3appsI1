# Director — milestone 10: store biblioteker uden fulde originaler i kortene

Status: LOCAL_DEMO. Ingen cloud, betaling eller generering er tilkoblet.

Biblioteket anvender nu en cursortransaktion pr. dokument og sekventiel,
afbrydelig billeddecode. Projektresuméer indeholder højst et 384 × 216 JPEG
på 65.536 data-URL-tegn; originale medier bevares i dokumentet. Billedheaders,
pixelgrænser, fem sekunders deadline og object-URL-oprydning begrænser
ressourceforbrug. Navigation og genindlæsning afbryder også uden BroadcastChannel.
Et beskadiget cover skjuler ikke filmen eller dens rå sikkerhedskopi.

Bevis: produktionstypecheck/build, 50 relevante unitcases, eksisterende
biblioteksflow på tre browsere og nyt stort-biblioteksflow på tre browsere.
Det nye flow bruger >20 MB faktisk seedet PNG-data, måler coverdimensioner og
størrelse, beviser højst én samtidig billed-URL, afbryder et kontrolleret
ventende decode, sammenligner hele dokumenthashes før/efter og henter den
fulde original med korrekt SHA-256. Rapporter i reports/director/*-large-library.json.

Afgrænsning: det aktuelle projekt og én stor kilde skal fortsat kunne rummes
lokalt. ZIP-kompression kører stadig på hovedtråden; næste afgrænsede arbejde
er worker-baseret, deduplikeret projektpakke med bevaret v1-import.
