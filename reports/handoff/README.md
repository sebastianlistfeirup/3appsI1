# Beviser fra overdragelsen

Disse filer knytter den afsluttende overdragelse til kildekoden, som GitHub faktisk testede. De er målinger fra udførte kontroller, ikke statusfelter brugt som erstatning for en test.

- `remote-checkout.json`: 30 originalfiler og renderkildefiler sammenlignet byte for byte efter HTTPS-klon og fast-forward til `9cc8ecd`.
- `core-verification.json`: konkret job, testantal, loguddrag og SHA-256 for databaseartefakten fra GitHub-kørsel `38997529920`.
- `database-final/`: de fire JSON-rapporter fra netop denne kørsel, udtrukket efter kontrol af artefaktens SHA-256. Den afbrudte FlowLab-beregning gennemførte 30 seedpar efter faktisk SIGKILL og naturligt leaseudløb; restore brugte to isolerede PostgreSQL-instanser.
- `studio-verification.json`: kilde, artefaktens kontrollerede SHA-256 og 150 beståede browserforløb. Den fulde udførte rapport ligger i `../e2e-results.json`.
- `studio-browser-steps.json` og `studio-http-proof.json`: de faktisk udførte Studio-kommandoer og 21 HTTP-kontroller fra samme job. `studio-http-proof-failure-probe.json` er en tilsigtet negativ prøve, der bekræfter, at en fejlet assertion giver en fejlkode; den overordnede kontrol er bestået.
- `director-verification.json` og de tilhørende `director-*.json`: native kontrol af den medfølgende font, 276 faktisk afkodede undertekstframes, uafhængig loudnessmåling, SIGKILL-genoptagelse og eksporthistorik fra den afsluttende Chromium-kørsel. Kommandoernes tidspunkter står i `director-browser-steps.json`.
- `flowlab-verification.json`, `flowlab-browser-steps.json` og `flowlab-http-proof.json`: 30 faktisk udførte Chromium-gatekommandoer og 22 produktions-HTTP-kontroller. Firefox og WebKit har egne grønne job i samme samlede kørsel.

Den lille restore-prøves tid omfatter ikke klargøring af en ny databaseinstans og er ikke et produktionsløfte om RPO/RTO. Identitet, databaser og privat fillager i integrationstestene er lokale testmiljøer. De dokumenterer fundamentet; de tilslutter ikke hosted login eller en offentlig cloudinstallation.
