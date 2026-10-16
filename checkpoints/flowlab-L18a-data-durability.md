# L18a — Datavalget skal være gemt før genindlæsning

Udført 2026-10-16 efter remote CI-fejl i Firefox på `data-history-check.ts:255`.

Fejlen lå efter genindlæsning: undo og gendannelse var allerede observeret i UI, men testen genindlæste straks ved teksten `Gemt: period-1.csv`. Den tekst kom fra den aktuelle React-tilstand og afventede ikke den serialiserede IndexedDB-kø. Under langsom lagring kunne reload derfor afbryde en eller flere af de endnu ikke afsluttede skrivninger. Den eksisterende topbjælke viste allerede korrekt `Gemmer…`, og shared persistence havde allerede en beforeunload-advarsel. Den lokale oprindelige Firefox-gate bestod; CI-timingfejlen hævdes ikke spontant reproduceret lokalt.

- Dataværkstedet får nu den faktiske fælles `saveState`. `Gemt:` vises kun efter `saved`. Under skrivning står `Valgt: … · Afventer lokal lagring`; ved fejl/konflikt står, at data ikke er gemt lokalt, og at en kopi skal eksporteres før lukning.
- Badge, importbesked og forhåndsvisning lover heller ikke længere en allerede afsluttet diskcommit ved et valg i hukommelsen.
- Regressionen holder en rigtig IndexedDB-transaktion åben med læsninger, indtil testen frigiver den. Den ændrer ingen lagrede værdier og fremstiller ingen save-events. Testen ser pending-status, verificerer fravær af `Gemt:`, frigiver transaktionen, afventer både datasættets og topbjælkens bekræftelse og genindlæser derefter.
- Holdet har en 15-sekunders øvre grænse; synkronisering styres af den observerede tilstand, ikke af en antaget diskhastighed. Ingen kunstig forsinkelse i produktet.

Verifikation: produktionbuild og FlowLab/motor-typechecks grønne. De 8 shared persistence-tests og 4 datasettests er grønne. `data-history-check.ts` består Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844 med den nye transaktionsregression, eksisterende rapport-/kildehashkontrol, undo/gendannelse/reload samt axe 0 og ingen browserfejl. Beviser: `reports/flowlab/data-history-*.json`, `data-history-save-tests.txt` og opdaterede dataværkstedsscreenshots.

Ingen ændring af motoren eller shared persistence. En vilkårlig afbrydelse af processen, før en gemning er bekræftet, er fortsat ikke en garanti for holdbarhed; UI beskriver nu dette korrekt.
