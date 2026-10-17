# Prøv de tre apps på telefonen

Åbn [den fælles startside](https://tre-apps-studio-sebastian.salty-venus-6590.chatgpt.site/proev/) i Safari eller Chrome. Log ind med den samme ChatGPT-konto, som ejer projektet, hvis siden beder om det. Vælg derefter en app. Ingen udviklingsserver eller appinstallation er nødvendig.

| App        | Direkte link                                                                      | Prøv først                                                                |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Studio One | [Åbn Studio](https://tre-apps-studio-sebastian.salty-venus-6590.chatgpt.site)     | Redigér en brief, opret en opgave, levér en fil manuelt og giv et review. |
| FlowLab    | [Åbn FlowLab](https://tre-apps-flowlab-sebastian.salty-venus-6590.chatgpt.site)   | Ændr kapaciteten og kør 30 parrede simuleringer; hent rapporten.          |
| Director   | [Åbn Director](https://tre-apps-director-sebastian.salty-venus-6590.chatgpt.site) | Justér scenen, gem et shot, og hent storyboard-PDF.                       |

På iPhone kan startsiden gemmes via **Del → Føj til hjemmeskærm**. På Android kan browserens menu bruges til at føje en genvej til startskærmen. Dette er webapps; en genvej er ikke en App Store-installation eller et løfte om offlinefunktion.

## Gem dit arbejde

Projekter gemmes lokalt i den enkelte browsers IndexedDB. Telefon, computer, privat browsing og forskellige browsere har hver deres data. Brug almindelig browsing, og hent en ZIP/JSON-projektpakke som backup. Eksport/import flytter arbejde mellem enheder. Rydning af browserdata fjerner den lokale kopi.

Prøvesiderne er private for ejeren. ChatGPT-login beskytter adgangen til selve websiden; det er ikke produktets fælles login, projektsynkronisering eller cloudlager. Studio bruger manuelle leverancer uden AI-agent. FlowLab udfører faktiske simuleringer i en browserworker. Directors scene, shots, PDF og projektpakker virker på telefonen; MP4 kræver den lokale computerudgave med FFmpeg. Der er ingen betaling eller aktiverede betalte leverandørkald.

## Kilde og publicering

De tre private Sites er publiceret fra særskilte, verificerede Git-snapshots. [Deploymentrapporten](../reports/mobile/deployments.json) angiver de faktiske kildecommits, versioner, deployment-ID'er og HTTPS-adresser. Deres basis er GitHub-commit `98764995dbe49591f521000baf97d7dcb01a454d` med den dokumenterede webprofil. Vercel-forbindelsen tillod ikke projektoprettelse; de faktiske udgivelser bruger Sites.

`tools/mobile/prepare.mjs` genskaber profilen fra den aktuelle **committede** kilde i en ny mappe uden for checkouten:

```sh
node tools/mobile/prepare.mjs studio /tmp/tre-studio-release
cd /tmp/tre-studio-release
pnpm install --frozen-lockfile
pnpm build
```

Brug `flowlab` eller `director` og en anden ny mappe til de andre apps. Scriptet bevarer de præcise, eksisterende Sites-ID'er fra `tools/mobile/sites.json`. Opret ikke nye Sites til opdateringer. Det fjerner server-API-routes fra snapshots, anvender den gennemgåede patch og laver statiske Next-exports i `dist/`. Studio beholder sine undersider i `?view=...`, mens normale hashankre stadig virker. Director får et statisk capability-svar og foretager ingen kald til native renderhistorik. Ændrede grundfiler, der ikke længere passer til patchen, stopper forberedelsen.

Efter QA skal den præcise kilde pushes til det pågældende Sites-kilderepository, og `.openai/hosting.json` plus den færdige `dist/` pakkes til en tar.gz. Brug det fulde push-verificerede commit-SHA ved `save_version_and_deploy_private`. Bevar eksisterende version-/deployment-ID'er ved retry. Credentials hentes kortvarigt fra Sites og tilføres kun via skjult stdin eller procesmiljø; de må ikke gemmes i kilde, rapporter eller shellhistorik. Scriptet opretter ingen Site og foretager ingen netværkspublicering alene.

## Verifikation

De faktiske rapporter ligger i [reports/mobile](../reports/mobile/). Touchviewport er 390×844; yderligere screenshots og tilgængelighedskontrol bruger 1024×768 og 1440×900. Det er browseremulering, ikke en fysisk iPhone-/Android-test.

- Studio: Chromium, WebKit og Firefox. Nyt projekt → brief → opgave → manuel HTML-leverance → review → genindlæsning → ZIP. Querybogmærker, reviewlinks og tilbage/frem er kontrolleret. 66 axe-scanninger af app og startside gav ingen registrerede WCAG2A/AA/2.1AA-fejl; brugerleverancernes isolerede previewframes testes visuelt og funktionelt uden at ændre deres sandbox. Kontrasten i reviewkvitteringer blev rettet efter et faktisk fund. Hele forløbet samt yderligere 22 axe-scanninger er også bestået på den publicerede HTTPS-origin i Chromium.
- FlowLab: alle tre browsermotorer. Ændret kapacitet, 30 reelle seedpar, rapportværdier/PDF/ZIP/JSON og fuld browsergenstart. 63 axe-scanninger uden registrerede overtrædelser. På den publicerede origin er beregning, faktiske downloads og genindlæsning også verificeret med Chromium.
- Director: Chromium og WebKit, faktisk 3D og tvungen 2D-fallback, immutable shotgemning, reload, seks siders PDF, ZIP-manifesthash og import i frisk browser. 10 axe-scanninger uden registrerede overtrædelser. På den publicerede origin er capability, sceneændring, shotgemning, reload og PDF/ZIP/JSON også verificeret med Chromium.
- Berørt Studio-kode: 77 unit-tests, typecheck og produktionsbuild bestået. Alle tre statiske produktionsbuilds er bestået. En frisk mappe genereret med forberedelsesscriptet har installeret fra lockfilen og bygget Studio inklusive startsiden.

En lokal statisk Studio-build kan kontrolleres igen ved at servere `dist/` på port 3020 og køre `node tools/mobile/verify-studio.cjs chromium` fra hovedrepositoryet. Erstat browseren med `webkit` eller `firefox`. `STUDIO_QA_URL` og `STUDIO_QA_OUTPUT` kan pege på en anden origin og rapportmappe. Browserbiblioteker skal være installeret. Rapporterne er konkrete testbeviser, ikke en fuld tilgængelighedscertificering.
