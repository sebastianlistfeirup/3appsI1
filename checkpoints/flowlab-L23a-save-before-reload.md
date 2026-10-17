# L23a — Genindlæs først efter bekræftet lagring

Udført 2026-10-17 efter L23. Ingen produktionskode eller motorændring.

## CI-fundet

GitHub-kørsel 38985106195, Chromium job 117255613613, fejlede i ressourcegaten: efter redigering af interval 1.000 forventedes `1999.001` minutter efter genindlæsning, men den gamle værdi `1999` blev vist. Testen udførte `apply.click()` umiddelbart efterfulgt af `page.reload()`. En anvendt model i React er ikke en bekræftet IndexedDB-commit.

## Deterministisk kontrol

Ressourcegaten holder nu en rigtig IndexedDB-skrivetransaktion åben med reelle read requests. Ingen dokumentværdier, lagringshændelser eller save-statusser erstattes. Et sikkerhedsloft på 15 sekunder forhindrer en efterladt blokering; testen frigiver selv transaktionen via en eksplicit hændelse, uden at vente et fast tidsrum.

Mens transaktionen faktisk er åben:

- Topbaren viser `Gemmer…`; `Gemt lokalt` findes ikke.
- Den anvendte model genåbnes. Interval 1.000 viser præcis `1999.001`, og den nye pulje `Ny efter oprydning` findes. Dermed bevares både kalenderændring, skift mellem puljer, fjernelse og tilføjelse i modellens hukommelse.
- Dialogen lukkes, og transaktionen frigives. Testen venter på faktisk `Gemt lokalt` og genindlæser derefter.
- Begge ændringer findes stadig efter genindlæsning.

Dette afstemmer kladde → anvendt model → varigt gemt model og fjerner testens reload-før-commit-race. Det reproducerer det nødvendige tidsvindue og udelukker felt-/pagineringstab i netop det testede forløb; det er ikke en påstand om andre hypotetiske lagringsfejl.

## Øvrige reload-gates

Alle tests, der genindlæser for at kontrollere persistens, venter nu eksplicit på den bekræftede save-status. Eksportknapper tæller ikke i sig selv som lagringsbevis: de skal fortsat kunne bruges til hukommelsesbaseret recovery ved fejl. Experiment-gatens tidligere 400 ms-vent er erstattet af faktisk save-status.

## Verifikation

- Ressourcegaten består i Chromium, Firefox og WebKit ved desktop, tablet og mobil med den holdte transaktion og samme nøjagtige værdier. Eksisterende løn-, referencesikkerheds-, kalender- og budgetkontroller bevares.
- Berørte Chromium-forløb er kørt igen: browser-check, journey, holdout, arrival-editor, duration-editor, experiment og experiment-settings. Typecheck er grøn. Produktionsbuild/motor er uændrede fra L23.
- Beviser ligger i de opdaterede `reports/flowlab/*-resource-editor-check.json` og de respektive gate-rapporter. Der er ingen ekstra sleep og ingen svækket værdiassertion.
