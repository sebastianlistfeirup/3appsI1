# Director checkpoint 15 — tidligere film og præcis projektbinding

Skrevet: lokalt eksportarkiv per produktion, schemastruktureret/bounded statuslæsning, projektbundne downloads, meningsfulde sikre filnavne, præcis manifest-sammenligning i worker og synlig opbevarings-/diskgrænse uden sletning. Aktiv statuspoll er sekventiel og afbrydelig; sene kald kan ikke erstatte et nyere valg.

Udført: tre faktiske native renderfiler med separate projektbindinger; forskellige versioner bevarer deres hashes. To faktiske UI-eksporter med samme id/revision, men forskellige dialoger, afslører forskellen med fuld manifest-hash. Gamle MP4/rapporter kan vælges og hentes uden at ændre det aktuelle projekt. Netværks-/worker-fejl bevarer tidligere resultater.

Verificeret: 74 units, TypeScript og produktionsbuild. Native historik-gate afviser korrupt/oversize/symlink/byttet-id-status samt ændret MP4. Komplet undertekst-render med 21 afkodede pixelchecks og målt lyd, reel SIGKILL-recovery med to genbrugte segmenter samt annullering er gentaget efter statusvalideringen. Browserhistorik-gaten dækker tre motorer med responsive screenshots/axe; rapporter under `reports/director/*render-history*`.

Tilkoblet: lokal disk, FFmpeg og browser-worker. Ingen cloud eller brugerautorisation påstås. Historikken scanner højst 100 små statusfiler. 100 jobpladser og mindst 512 MiB fri plads ved jobstart er grænser, ikke en diskreservation eller tidsbaseret retention. Ældre ubundne job vises ikke som tilhørende et bestemt projekt og bevares urørt.
