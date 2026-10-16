# Tre apps — arbejdsstatus

Aktiv udvikling fra 16. oktober 2026 kl. 19.30 UTC. Brugerens tidsbudget: op til otte timer. Profil: **DEMO**, syntetiske data og lokal browserlagring. Ingen nye betalte eksterne kald.

| Produkt    | Faktisk opnået                                                                                                                                                                                                  | Næste bevis                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Studio One | Nyt projekt → brief → opgave → manuel fil → review → accepteret leverance → ZIP. 24 browserforløb i tre motorer, seks kerneskærme uden axe-fejl. Valideret, valgfrit server-API.                                | Større projektpakker, hjælpetekst og komplet ren CI.               |
| FlowLab    | Motor 1.2, deterministiske fixtures, uafhængig holdout-kalibrering, CSV/PDF/ZIP og 18 axe-skærme uden fejl. 60-konfigurationers differentialaudit. 30 × 10.000 sager × 20 noder: 30,83 sekunder.                | Importprovenance ved ændret mapping, annullering og store datasæt. |
| Director   | Faktisk 60s 720p H.264/AAC MP4, storyboard-PDF/ZIP, GLB, tre browsere med 2D-fallback, real media-preview og målt lyd. SIGKILL/genstart og 59,5s crossfade verificeret. 26 fixtures og 22 axe-skærme uden fejl. | GLB-teksturer og produktionsbibliotek.                             |

Fælles: 41 grønne integrationstests i isoleret PostgreSQL/pg-boss og 11 tests af kryptografisk loginvalidering. Låst pnpm-workspace, tre selvstændige Next-apps, versionsdisciplin, checkpoints og IndexedDB med revisionskonflikter. JWT/API/worker er verificeret lokalt med separate begrænsede databasebrugere. Hosted Cloud/Auth, betalt generation og betaling er ikke tilkoblet. Der er ingen baggrundsdæmon lovet eller aktiveret; fremdriften sker i den aktive session og dokumenteres her.
