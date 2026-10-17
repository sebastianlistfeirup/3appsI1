# Tre apps. Tre måder at få godt arbejde færdigt.

**Studio One**, **FlowLab** og **Director** er tre selvstændige Next.js-apps bygget efter den vedlagte Masterbibel. Denne udgave kan bruges lokalt uden API-nøgler. Den indeholder rigtige editorer, versionshistorik, beregninger og eksporter — med tydeligt mærkede, syntetiske eksempelprojekter.

Se [aktuel status og verificeret omfang](STATUS.md), [verifikationsbeviser](reports/) og [næste integrationsblok](docs/release-readiness.md). Cloud-login, betalt AI-generation og betaling er ikke aktiveret. De lokale produkter kan afprøves uden disse forbindelser.

## Start på din maskine

Krav: Node.js 24.19.0 og pnpm 11.25.0. Installér pnpm med `npm install -g pnpm@11.25.0`, hvis det mangler.

```bash
git clone https://github.com/sebastianlistfeirup/3appsI1.git
cd 3appsI1
pnpm install --frozen-lockfile
pnpm dev
```

| App        | Åbn                   | Første forløb                                                                                 |
| ---------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Studio One | http://localhost:3000 | Åbn Realmread, sammenlign leverancen og giv et review. Opret derefter din egen bestilling.    |
| FlowLab    | http://localhost:3001 | Se medlemsservice-modellen, ændr kapacitet og kør 30 parrede sammenligninger. Hent rapporten. |
| Director   | http://127.0.0.1:3002 | Se scenen, justér kameraet, gem en ny shotversion og hent storyboard eller projektpakke.      |

Data gemmes i browserens IndexedDB. Hent en ZIP/JSON-kopi af arbejde, du vil beholde. To samtidige faner får en synlig versionskonflikt; den ene overskriver ikke stiltiende den anden. Ingen browserdata uploades automatisk til en server.

Vil du begynde med konkrete resultater, så hent [prøvepakken med en rigtig analyse, film og to reviews](examples/foerste-gennemgang/README.md). Den kan importeres i Studio og kræver ingen nøgler.

Læs den korte [Studio-vejledning](docs/studio.md), [FlowLab-vejledning](docs/flowlab.md) eller [Director-vejledning](docs/director.md) for et samlet første arbejdsforløb.

### Faktisk MP4 fra Director

Installér `ffmpeg` og `ffprobe` på din PATH. Start Director med den lokale renderprofil:

```bash
DIRECTOR_LOCAL_RENDER=1 pnpm dev:director
```

På PowerShell: `$env:DIRECTOR_LOCAL_RENDER="1"; pnpm dev:director`.

Tryk **Eksportér → MP4**. Den lokale worker samler ægte 1280×720, 24 fps H.264/AAC med kameraframes, egne klip og lyd. Appen binder til loopback; denne profil er til din egen maskine. Se [renderopsætning og grænser](docs/director-local-render.md). Eksempelfil: [60 sekunders MP4](reports/director/det-sidste-signal-720p.mp4).

## Se produkterne

### Studio One

![Studio One: versionsstyret produktion og review](reports/studio/overview-desktop.png)

Bestilling, opgaver med afhængigheder, immutable filversioner, manuelle leveringer, før/efter-preview, review og ZIP med SHA-256-manifest. Hver opgave har sin [ansvarlige og egne færdigkrav](docs/studio-task-definitions.md), som låses sammen med leveringen. Uploadet HTML vises isoleret, uden scripts eller eksterne netværkskald. Et manuelt resultat bliver aldrig kaldt en verificeret ekstern build.

Filinspektøren viser hver versions ophav, historik og konkrete anvendelser. Redigering bevarer licensoplysninger; afklaring af rettigheder bliver en ny version med samme indhold. Se [filversioner og ophav](docs/studio-artifacts.md).

Vælg de præcise inputversioner før start, og hent en [arbejdspakke](docs/studio-work-packages.md) med den låste aftale, originalfiler og kontrolsummer. Den gør grundlaget flytbart til dine egne værktøjer. Rettelser tager udgangspunkt i de faktisk gennemgåede filer.

[Aktivitetshistorikken](docs/studio-history.md) har søgning, statusfilter og sider, også i et projekt med 1.000 forløb og 10.000 hændelser. Links til tidligere afleveringer åbner den relevante side.

Ufærdige manuelle leverancer gemmes som kladder og kan genoptages efter genåbning. Projektpakker bevarer hele historikken og kan åbnes som selvstændige kopier. Pakning kører i en browser-worker og kan afbrydes. Ugemte ændringer kan eksporteres ved lagerfejl. Se [pakkeformat, grænser og gendannelse](docs/studio-project-packages.md).

Også [ufærdige reviews](docs/studio-review-drafts.md) bevarer kommentarer og afkrydsninger. En kladde godkender aldrig automatisk en levering eller forældet input.

[Bestillingskladder](docs/studio-brief-drafts.md) bevarer også ufærdige og endnu ugyldige krav. Først en eksplicit udgivelse opretter en ny briefversion. En kladde baseret på et ældre brief kræver en ny bekræftelse.

Under Indstillinger kan flere projekter hentes som én [samlet lokal backup](docs/studio-workspace-backup.md). Indlæsning kontrollerer indholdet og bevarer eksisterende projekter som selvstændige originaler.

### FlowLab

![FlowLab: model, kapacitet og målte scenarier](reports/flowlab/desktop-model.png)

En deterministisk diskret hændelsesmotor, proceseditor, ressourcepuljer, kalender, routing, CSV-kvalitet og baseline/scenarier med samme seeds. Resultater viser spredning og begrænsninger; PDF og JSON bruger samme beregninger. Diagrammet understøtter tastaturflytninger, fortryd og bevaret fokus. Et syntetisk udfald er en simulering, ikke dokumenteret forretningsgevinst.

[Holdout-status](docs/flowlab-holdout.md) angiver præcis baseline, datakilde og periode. En tidligere vurdering bliver synligt historisk ved ændrede input; den godkender ikke automatisk alternativet.

Den valgfrie [serverprofil](docs/flowlab-server-jobs.md) kører også motoren i en varig kø og kan genstarte en afbrudt beregning fra låste input. Browseren bruger fortsat lokal lagring; hosted login er ikke tilsluttet.

[Fristoverblikket](docs/flowlab-sla.md) skelner mellem afsluttede sager inden for fristen, forsinkede sager og den kendte del af restkøen. UI, CSV og PDF viser de samme antal og usikkerheder.

### Director

![Director: faktisk 3D-scene, kameraer og shots](reports/director/desktop-scene.png)

3D-scene og brugbar 2D-fallback, egne GLB-modeller, fem kameraer, immutable shotversioner, framebaseret tidslinje, egne medier og rigtige eksporter. MP4'en er en animatic med stillbilleder og klip; der loves ikke kontinuerlig karakteranimation. Et [projektbundet eksportarkiv](docs/director-export-archive.md) bevarer tidligere filer og deres kvalitetsrapporter.

[Lydtidslinjen](docs/director-audio-timeline.md) viser faktisk start, trim, slutning og fades. Projektkopier kan gendannes i baggrunden, også som stor JSON med originale medier.

I [sceneplanen](docs/director-scene-plan.md) kan objekter, kamera og kameramål flyttes direkte med mus, berøring eller tastatur. Tidligere shots og sekvensversioner bevarer deres oprindelige scene.

[Sammenlign før opdatering](docs/director-continuity-review.md) viser det låste shot ved siden af en faktisk kandidat fra arbejdsscenen. Godkend den konkrete ændring, mens tidligere versioner bliver bevaret.

## Kontroller arbejdet

```bash
pnpm typecheck
pnpm test
pnpm test:db
# Med PostgreSQL 17+ klientværktøjer installeret:
pnpm test:restore
pnpm build
# Faktisk HTTP/TLS/JWT/worker/upload, servergenstart og fildownload:
pnpm test:http
pnpm test:http --app=flowlab
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:browser
```

Browserkontrollerne bruger de fastlåste Playwright-browsere. En anden Chromium kan kun vælges med den eksplicitte variabel `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Browserpakken kræver også `ffmpeg`, `ffprobe` og `pdftotext` fra Poppler. Firefox-lydtesten kræver en lydtjeneste; brug den dokumenterede [lokale PulseAudio-testopsætning](docs/director-verification.md#render-and-recovery-gate) på en Linux-server uden lydkort. Luk lokale appservere før `pnpm test:browser`, som starter sine egne produktionsbuilds på port 3000–3002. GitHub Actions kører de samme gates og gemmer rapporter. Ét fejlet check stopper kørslen; tests, der ikke er udført, mærkes ikke som bestået.

`test:db` opretter en isoleret lokal PostgreSQL 17.10-instans, kører de rigtige migrationer og tester RLS, budgetter, pg-boss, revisioner og leases. Den rører ikke en ekstern database. [HTTP-prøven](docs/backend-http-proof.md) kører desuden hele server-/worker-/filforløbet over rigtige forbindelser. [Backendprofilen](docs/backend-profile.md) beskriver det verificerede fundament og de forbindelser, der stadig mangler.

## Find rundt

- `apps/studio`, `apps/flowlab`, `apps/director`: uafhængige apps og builds.
- `packages/flow-engine`, `packages/scene-format`: testbare domænekerner.
- `packages/persistence`: lokal lagring, konfliktbeskyttelse og regressionstests.
- `packages/database`, `packages/jobs`, `packages/auth`, `packages/backend`, `packages/storage`: serverfundament og verificerede kontrakter.
- `services/worker`: separat jobproces og lokal Director-CLI.
- `migrations`: additive PostgreSQL-migrationer.
- `docs/spec`: tekstudtræk fra den brugerleverede PDF; autoritativ kilde for opgaven.
- `checkpoints`, `program`, `reports`: fremdrift, arbejdsmandat og konkrete beviser.

Versioner og platform er registreret i [VERSION_MATRIX.md](VERSION_MATRIX.md). Der er ikke valgt en offentlig produktlicens; se fontlicenserne i hver apps `public/fonts`.
