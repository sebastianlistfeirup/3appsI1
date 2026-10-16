# Tre apps — arbejdsstatus

Aktiv udvikling fra 16. oktober 2026 kl. 19.30 UTC. Brugerens tidsbudget: op til otte timer. Profil: **DEMO**, syntetiske data og lokal browserlagring. Ingen nye betalte eksterne kald.

| Produkt    | Faktisk opnået                                                                                                                                                                               | Næste bevis                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Studio One | Nyt projekt → brief → opgave → manuel fil → review → accepteret leverance → ZIP. 11 domænetests og 6 brugerforløb i Chromium, Firefox og WebKit (18/18). Ingen axe-fejl på seks kerneskærme. | Datagrænser, streng importvalidering og mere robust fejlretning. |
| FlowLab    | Integreret deterministisk motor, 29 grønne fixtures, model/scenarie/rapport-flow og faktisk PDF/ZIP. Benchmark: 30 × 10.000 sager × 20 noder på 35,58 sekunder.                              | Motoraudit, indlejrede PDF-fonte og tilgængelighed.              |
| Director   | Integreret sceneeditor og faktisk 60s 720p H.264/AAC MP4, storyboard-PDF og ZIP. 16 fixtures; SIGKILL/genstart og 59,5s crossfade verificeret.                                               | GLB-import, yderligere browserforløb og tilgængelighed.          |

Fælles: 28 grønne integrationstests i isoleret PostgreSQL/pg-boss og 11 tests af kryptografisk loginvalidering. Låst pnpm-workspace, tre selvstændige Next-apps, versionsdisciplin, checkpoints og IndexedDB med revisionskonflikter. Cloud/Auth, betalt generation og betaling er ikke tilkoblet. Der er ingen baggrundsdæmon lovet eller aktiveret; fremdriften sker i den aktive session og dokumenteres her.
