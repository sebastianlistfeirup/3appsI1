# Privat mobilpublicering — 17. oktober 2026

Brugeren bad om at kunne afprøve alle tre apps på telefonen og godkendte publicering. Leverancen er tre faktiske, ejerprivate Sites og én fælles mobilstartside: https://tre-apps-studio-sebastian.salty-venus-6590.chatgpt.site/proev/.

## Skrevet og udført

- Next static-export-profiler i særskilte kildesnapshots; serverroutes er fjernet fra webudgaverne. Eksisterende browserlogik, workers, IndexedDB og eksportfiler bevares.
- Studio har en statisk queryadapter til navigation, bogmærker, reviewundersider og tilbage/frem. Hashankre er fortsat til rådighed. Ny responsiv dansk startside linker de tre faktiske origins.
- Director returnerer et ærligt statisk capability-svar, forklarer at MP4 kræver computerprofilen og genoptager ikke native serverjobs eller forsøger at hente et uforbundet arkiv.
- Et faktisk tilgængelighedsfund førte til mørkere tekst i Studios reviewkvittering og større datotekst. Rettelsen findes både i hovedkilden og den udgivne Studio-profil.
- Reproducerbar forberedelse, registrering af eksisterende Sites-ID'er, kildepatch og browserverifikation ligger i `tools/mobile/`. Ingen tokens indgår. En ny mappe genereret af scriptet installerede fra lockfilen og byggede Studio + startside.

## Verificeret

Alle tre builds bestået. Studio: typecheck, 77 unit-tests og native produktionsbuild; Chromium/WebKit/Firefox har gennemført nyt projekt, brief, opgave, manuel leverance, review, ZIP, reload, querybogmærke og tilbage/frem. 66 lokale og 22 hosted axe-scanninger uden registrerede WCAG2A/AA/2.1AA-fejl. Isolerede brugerpreviewframes bevarer sandbox og testes funktionelt/visuelt uden axe-injektion. Den nye startside er inspiceret i tre størrelser.

FlowLab: tre browsermotorer, ændret kapacitet, faktiske 30 seedpar, kontrollerede PDF/ZIP/JSON-værdier og fuld browsergenstart; 63 axe-scanninger. Director: Chromium/WebKit, 19 kontroller og 10 axe-scanninger med 3D/2D, immutable shots, reload, seks siders PDF, ZIP-hash og frisk import. Ingen registrerede sidefejl eller vandret overflow i de testede visninger.

**Alle tre faktisk publicerede HTTPS-origins** har derefter bestået Chromium med touch390×844. Studio gennemførte hele det ovenstående forløb og 22 scanninger. FlowLab udførte nye workerberegninger og rigtige downloads. Director ændrede scene, gemte shot, genindlæste og hentede PDF/ZIP/JSON. Sites-adgangstokens var kun i processens hukommelse, HTTP-headeren var begrænset til præcis origin, redirects blev håndteret uden tokenvideresendelse, og TLS-validering var aktiv. Anonym FlowLab-navigation gav401, som forventet for en privat Site.

En første hosted-probe havde en transportfejl, fordi Playwrights APIRequestContext ikke arver HTTPS_PROXY automatisk. Probeopsætningen fik den arvede proxy eksplicit; certifikatvalidering blev bevaret. Efterfølgende faktiske origin-tests bestod. Vercels connector afviste projektoprettelse med403; der blev ikke forsøgt at omgå afvisningen. Sites er den anvendte hosting.

## Tilkoblet og afgrænset

Tilkoblet: private HTTPS-webudgivelser med ejerens ChatGPT-adgang. [Deploymentrapporten](../reports/mobile/deployments.json) binder hver udgave til push-verificeret kildecommit og faktisk terminalt deployment. [Mobilvejledning](../docs/mobile-demo.md) indeholder links, første forløb, backup og drift.

Ikke tilkoblet: produkternes fælles identitet/workspaces, clouddata/synkronisering, AI, betaling og hosted native rendering. Browserdata er lokale pr. origin og enhed. Testene er browseremulering; ingen fysisk telefon eller dens native delingsdialog er testet. Hovedprojektets oprindelige CI-bevis på `9cc8ecd` er fortsat historisk og bliver ikke omskrevet til at dække denne ændring. De nye lokale og hosted beviser ligger i `reports/mobile/`.
