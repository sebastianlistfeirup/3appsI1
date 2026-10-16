# L19 — Fra planlagt løn til efterprøveligt resultat

Udført 2026-10-16 efter L18a. Ingen ændring af motorens beregning eller versionsnummer.

## Leveret

- Resultater viser reserveret løn, variable aktivitetsbesøg, fast automation og samlet omkostning for baseline, alternativ og forskel. Brugeren kan vælge gennemsnit eller et konkret fælles seed. Kørsel og pulje matches efter deres id/seed, ikke arrayposition.
- Puljeoversigten viser reserveret, optaget og ledig medarbejdertid, udnyttelse og reserveret løn. Egne labels fra hver model bevares også ved omdøbning. Ubrugte puljer markeres med deres faktiske løn. Manglende puljer er adskilt fra nul kapacitet og ukendt udnyttelse.
- Højst otte puljepar vises ad gangen. Søgning og direkte sidevalg understøtter op til 100 forskellige id på tværs af modellerne. Eksport er fuldstændig uanset side og filter.
- Nye CSV-filer har alle seeds, modelside, kørselsstatus, målevindue, kroner og medarbejdermillisekunder. Formellignende id/navne får en apostrof i CSV; de oprindelige værdier i modeller og JSON ændres ikke.
- Rapportpakken indeholder `costs.csv` og `resources.csv`, afledt fra samme run-metrics som UI. PDF har en omkostningsside med alle puljer sideopdelt efter behov. Standardrapporten har nu fire sider. README og `docs/flowlab-costs.md` forklarer enheder og de præcise opkrævningsregler.
- På telefon vises totalerne også i to læsbare kort, og tabellen har en synlig forklaring på vandret rulning. Alle faktiske beløb er stadig tilgængelige i den samme tabel. Header og tal har tydeligere typografi.

## Verificeret

- 112 Flow-/motortests på 17 filer; typecheck og produktionsbuild grønne.
- Golden med start på målevinduet 120.000 ms: baseline 5 kr. løn + 7 kr. aktivitetspris + 100 kr. fast = 112 kr. Alternativ med to medarbejdere og ubrugt reserve: 40 + 7 + 250 = 297 kr. Alle 30 seeds afstemmes i de faktisk downloadede filer.
- Faktisk optaget tid for baseline er 150.000 ms, mens den reserverede tid er 180.000 ms. Den ubrugte reserve har 0 optaget tid, 360.000 ms reserveret tid og 30 kr. løn. Et besøg, der startede før observationsvinduet, får ikke en ny variabel omkostning ved observationsstart.
- Kalenderfixture har availableTime 140.000 ms, busyTime 90.000 ms og salaryCost 140.000/3.600.000×100. Partial før målevinduet beholder 100 kr. fast automation, mens løn og variabel pris er 0. Ukendt seed giver ukendte beløb, ikke nul.
- `cost-profile-check.ts` er grøn i Chromium, Firefox og WebKit ved 1440×900, 1024×768 og 390×844. Virkelige 30-seed-kørsler, CSV-downloads, ZIP og PDF-tekst, sidste seed, nul/manglende puljer samt 100-puljers søgning/sidevalg. Fuld eksport har 3.001 CSV-linjer, selv når ét filtermatch vises. Axe WCAG2A/AA/21AA: 0; browserfejl: 0; ingen dokumentoverflow.
- PDF-layoutgaten udvides med 100 forskellige pulje-id, 100-tegns navne, maksimalt fast beløb og de eksisterende lange danske fortællinger. Rigtig PDF: 24 sider, 3.047 ord, alle 100 id til stede og ingen ord uden for sidemarginerne. Stress-PDF-side og desktop/tablet/mobil blev visuelt inspiceret.
- Eksisterende tidsfordelings- og edge-results-gates er grønne mod den nye resultatvisning og rapportpakke (Chromium).

Beviser: `reports/flowlab/*-cost-profile-check.json`, `*-cost-profile.png`, `*-cost-report.pdf`, `cost-pdf-stress-page.png`, `report-layout-check.json`, `report-long-content.pdf`, `engine-tests.txt`.

Afgrænsning: tal er simulerede omkostninger, ikke realiserede besparelser. UI/PDF afrunder; JSON/CSV bevarer motorens tal. En puljes medarbejdere er en modelantagelse; samme person må stadig ikke tælles dobbelt i forskellige pools. Der er ingen automatisk bemandingsoptimering eller reel lønintegration.
