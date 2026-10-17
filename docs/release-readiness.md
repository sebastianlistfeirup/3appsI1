# Fra lokal udgave til en tilsluttet beta

Denne leverance giver tre fungerende lokale produkter og et særskilt, afprøvet serverfundament. Produktprofilerne er **DEMO/MANUAL**. Eksempler er syntetiske, browserdata gemmes lokalt, og nye betalte kald er slået fra. Et installeret bibliotek eller en lokal fixture bliver ikke regnet som en tilsluttet leverandør.

## Masterbiblens gates

| Gate | Opnået og resterende bevis |
| --- | --- |
| G0 · Bootstrapped | Repository, låste afhængigheder, registrerede versioner, syntetiske eksempler og tre produktionsbuilds. |
| G1 · Core works | Kernerejser, domænefixtures og faktiske eksporter er afprøvet i Chromium, Firefox og WebKit. Lokale browserkontroller omfatter desktop, tablet, mobil og automatiserede tilgængelighedstjek. |
| G2 · Connected | Lokal IndexedDB og rigtige eksportfiler virker. PostgreSQL/RLS, JWT, private filer og en separat worker er afprøvet gennem faktiske forbindelser. Browserne er endnu ikke tilsluttet hosted login, workspaces eller cloudlager. Gaten er derfor ikke erklæret opfyldt for de samlede produkter. |
| G3 · Resilient | Lokale kvotefejl, to faner, genåbning, eksport/import, faktisk processtop, køgenlevering og restore har konkrete beviser. Betalte leverandørers ukendte udfald og en hosted driftsinstallation mangler stadig deres egne prøver. |
| G4 · Private beta | Hovedforløb er automatiseret fra brugerens UI, og der er korte danske vejledninger. Ingen ekstern brugertest eller tilsluttet privat beta er gennemført. |
| G5–G7 | Testbetaling, produktionsdrift, godkendt livebetaling, faktiske kunder og målt forretning er ikke aktiveret eller erklæret verificeret. |

Den detaljerede [FlowLab-kontraktaudit](flowlab-audit.md) viser krav, konkrete fejl, rettelser og de fortsat manglende forbindelser.

[Kortet over biblens acceptkrav](acceptance-map.md) forbinder også Studio- og Director-id'erne med konkrete tests og viser, hvor et lokalt bevis stadig mangler den tilsluttede kundesti.

Se [arbejdsstatus](../STATUS.md), [CI](https://github.com/sebastianlistfeirup/3appsI1/actions), de konkrete [checkpoints](../checkpoints/) og [rapporter](../reports/) for tidspunkt, commit og testomfang. En grøn automatiseret tilgængelighedsscanning erstatter ikke test med hjælpemidler og rigtige brugere.

## Næste integrationsblok

1. Provisionér en faktisk identitetstjeneste, private workspaces og separat runtimeadgang til database/kø. Tilslut et login- og synkroniseringsflow i browserne, og gentag tenant-, adgangs- og konflikttests over de rigtige endpoints. Det lokale arbejde skal kunne eksporteres før en eventuel overgang.
2. Vælg og forbind privat cloudobjektlager, driftsmiljø, supervision, logning, rate limits og backupplan. Gentag en hosted restore med realistiske datamængder. Den lokale lille prøve er ikke et løfte om RPO/RTO. Fastlæg også oprydning af uafsluttede uploads og retention af renderarkivet; de bliver aktuelt bevaret.
3. For Studio: forbind en konkret kodeagent eller en kontraktfast ekstern adapter med en isoleret eksekveringsprofil, eksplicitte tilladelser og et beløbsloft. Den nuværende arbejdspakke er flytbar, og den manuelle validator kontrollerer data, men kører ikke en ekstern build.
4. For FlowLab: forbind den eksisterende varige serverberegning til det autentificerede UI, og afprøv modeldata og holdout på et reelt, tilladt datasæt. En syntetisk forbedring er ikke dokumenteret forretningsgevinst.
5. For Director: forbind kun ønskede generationstjenester efter en faktisk kontrakt-/capabilitytest og et budget. Den nuværende film er en rigtig animatic med stillbilleder, egne klip, tekst og lyd; kontinuerlig karakteranimation og tilkoblet generativ video er separate funktioner.
6. Indfør først testbetaling, webhooksignaturer, dubletbeskyttelse, refunds og prisvilkår, når betalingsleverandør og produktplan er valgt. Livebetaling og offentlig produktionsdrift kræver deres egne efterfølgende beslutninger.

Brugerens lokale prøve kan begynde nu uden disse forbindelser. [README](../README.md) og de tre produktvejledninger beskriver præcis, hvad der virker i den aktuelle profil.
