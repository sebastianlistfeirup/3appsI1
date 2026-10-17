# Tre apps — verificeret omfang

**Opdatering 17. oktober 2026:** De tre browserprofiler er nu publiceret som private HTTPS-Sites med en [fælles mobilstartside](https://tre-apps-studio-sebastian.salty-venus-6590.chatgpt.site/proev/). Se [mobilvejledning og kontrolomfang](docs/mobile-demo.md) samt [faktiske deployments](reports/mobile/deployments.json). Webdemoerne gemmer data i den lokale browser. Sites-adgang med ejerens ChatGPT-konto er tilkoblet; produktets fælles identitet, clouddata og serverworkers er fortsat særskilte integrationsopgaver. MP4-rendering kræver computerprofilen. Det følgende beskriver den oprindelige otte-timers leverance; mobilopdateringen har sit eget [checkpoint](checkpoints/foundation-16-mobile-publication.md).

Arbejdet følger den brugerleverede Masterbibel. Arbejdsperioden er 16. oktober 2026 kl. 19.30 UTC til 17. oktober kl. 03.30 UTC. Denne udgave har tre selvstændige lokale produkter med syntetiske eksempler og et særskilt serverfundament. Produktprofilerne er **DEMO/MANUAL**; ingen nye betalte leverandørkald er aktiveret.

| Produkt | Kan bruges nu | Grænse for den aktuelle udgave |
| --- | --- | --- |
| Studio One | Bestillinger og vedvarende kladder; opgaver med ansvarlig, egne krav og afhængigheder; valg af præcise inputversioner; låste manuelle forløb; bærbar arbejdspakke; versioner, provenance, diff og review; søgbar historik; projekt-ZIP og samlet backup. Lagerfejl giver mulighed for at hente arbejdet. | Ingen tilsluttet kodeagent eller ekstern build. Manuel bekræftelse er tydeligt skilt fra automatisk verificering. |
| FlowLab | Proceseditor med præcise numeriske kladder, ankomster, routing, genarbejde, ressourcepuljer og arbejdsplaner; deterministiske 30-seedpar; usikkerhed, tids-/omkostnings-/SLA-profiler, konkrete sagsforløb, CSV-kvalitet, holdout og faktiske PDF/CSV/JSON/ZIP-rapporter. | Eksempler er syntetiske. Holdout gælder den konkrete baseline, datakilde og periode; alternativet godkendes ikke automatisk. Browseren er ikke koblet til den valgfrie serverkø. |
| Director | 3D og interaktiv 2D-plan; egne statiske GLB-modeller; fem kameraer; immutable shots og sekvenser; visuel sammenligning før opdatering; egne klip, lyd og framepræcise undertekster; PDF, projekt-ZIP/JSON og valideret 720p H.264/AAC via lokal FFmpeg. | Filmen er en animatic med stillbilleder og egne klip. Ingen kontinuerlig karakteranimation eller tilkoblet generativ video. MP4 kræver den eksplicit aktiverede lokale renderprofil. |

## Udført kontrol

- Afsluttende GitHub-kørsel: [38997529920](https://github.com/sebastianlistfeirup/3appsI1/actions/runs/38997529920) på `9cc8ecd`: alle **otte job** bestået, inklusive fælles kontrol, Studio, alle tre FlowLab-browsere og alle tre Director-browsere. [Tidspunkter og jobbeviser](reports/ci/github-9cc8ecd.json). Overdragelsesændringerne oven på denne commit er kun dokumentation, arbejdsmetadata og faktiske rapporter; produktkode, tests, dependencies og CI-konfiguration er identiske med den verificerede udgave.
- Seneste samlede lokale domænekontrol: **338 unit-tests i 54 filer**, alle workspace-/værktøjstypechecks og faktiske produktionsbuilds.
- Studio: **150 samlede browserforløb** bestået i Chromium, Firefox og WebKit på GitHub (7,8 minutter, nul fejl, udeladelser eller flaky cases). Det omfatter sikker afbrydelse efter faktisk workerarbejde, forsinkede svar, retry og genåbning.
- Den medfølgende [prøvepakke](examples/foerste-gennemgang/README.md) er importeret og gennemgået i yderligere tre browserforløb med faktisk download, hashkontrol, to eksplicitte reviews og ny eksport. De redigerbare FlowLab-/Director-originaler er desuden faktisk importeret, eksporteret og genåbnet i alle tre browsere. En ren checkout har installeret fra lockfilen og bygget alle tre apps. En separat HTTPS-klon fra GitHub har desuden bekræftet de originale projektfiler, filmen, fonte og den seneste renderkode byte for byte; [30 sammenlignede filer](reports/handoff/remote-checkout.json).
- FlowLab og Director har domænefixtures, reelle eksportfiler og browsergates i de samme tre motorer. Relevante visninger kontrolleres ved 1440×900, 1024×768 og 390×844 med screenshots og axe. De konkrete checkpoints angiver omfanget; en automatisk scanning er ikke en ekstern tilgængeligheds- eller brugertest.
- **71 databaseintegrationer** med rigtige migrationer, RLS, begrænsede konti, idempotens, budgetreservationer og pg-boss. Faktisk processtop og naturligt leaseudløb genoptager en afbrudt FlowLab-beregning uden dobbeltresultat eller dobbeltforbrug.
- Faktisk HTTP → certifikatvalideret HTTPS/JWKS → JWT → RLS → separat worker → privat fil. Identitetstjenesten i prøven er en lokal fixture. Uafsluttede uploads overlever et reelt Next-processtop; en mistet kvittering efter faktisk COMMIT skaber ingen dublet.
- Faktisk backup/restore til en ny PostgreSQL-instans har gendannet **27 app-/køtabeller**, to filversioner og en uafsluttet upload med efterfølgende RLS-/idempotens-/budgetkontrol. Den lille syntetiske prøve er ikke et produktionsløfte om RPO/RTO.

## Tilsluttet og endnu ikke tilsluttet

IndexedDB, browserworkers, PDF/ZIP, lokal PostgreSQL/pg-boss, de faktiske lokale API-prøver og FFmpeg har udført rigtigt arbejde. Hosted login/workspaces, cloudobjektlager, live leverandører, betaling og offentlig produktionsdrift er **ikke** tilkoblet. Der er ingen aktiveret baggrundsdæmon eller løfte om fortsat arbejde efter sessionen.

Se [README](README.md) for opstart og skærmbilleder, [de næste integrationsblokke](docs/release-readiness.md) for den præcise vej til beta, og [checkpoints](checkpoints/) / [rapporter](reports/) for de enkelte beviser. De historiske checkpoints bevarer både fundne fejl og efterfølgende rettelser.

Sessionen er afsluttet. [Overdragelsescheckpoint](checkpoints/foundation-15-handoff.md) og [maskinlæsbar slutstatus](reports/handoff/session.json) binder det leverede omfang til den faktisk verificerede kildekode.
