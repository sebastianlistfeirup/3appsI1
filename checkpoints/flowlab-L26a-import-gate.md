# L26a — Importtest venter på den aktuelle model

Udført 2026-10-17 efter main-CI 38995723520. Ingen produktkode ændres.

Firefox-forløbet for ankomsteditoren kunne genbruge en stadig synlig besked fra en tidligere import. Testens `load(empty)` gik derfor videre, mens den nye modelpakke stadig blev læst, og kunne navigere før det forventede input var indlæst. En importtoast er ikke et bevis for, at netop den aktuelle fixture er klar.

Helperen venter nu på **begge fulde modeller** fra browserens faktiske IndexedDB-dokument: baseline og alternativ skal matche den nye fixture. Id alene er utilstrækkeligt, fordi flere fixtures bruger samme golden-id. Den venter desuden på, at importoperationens Afbryd-knap er væk, før Model åbnes. Playwright poller den faktiske betingelse med en øvre tidsgrænse; der er ingen fast pause eller ændring af appens workers.

Alle assertions for kapacitet, ankomstliste, routing, paginering, tom liste, rapport, reload, undo, fokus og axe er bevaret. En gammel importtoast kan ikke opfylde den nye modelbetingelse.

Verifikation: `arrival-editor-check.ts` i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844 mod koordinatorens rene produktionsbuild på port 3001 (e2df9ac; samme FlowLab-L26-produktkode). Faktiske worker-kørsler og rapportdownloads gennemføres. Browserfejl: 0; axe: 0. Beviser: `reports/flowlab/*-arrival-editor-check.json` og ankomsteditorens tilhørende skærmbilleder.
