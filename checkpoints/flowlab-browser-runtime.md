# Fast browserruntime i lokale checks og CI

2026-10-16: Alle 13 FlowLab-browserchecks bruger nu Playwrights installerede Chromium som standard. En anden binær kræver eksplicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; tilstedeværelsen af `/usr/bin/chromium` ændrer ikke længere testmiljøet automatisk. Firefox/WebKit styres fortsat med `FLOWLAB_BROWSER` i de fælles gates.

Verificeret mod Playwrights Chromium 156 / revision 1248: journey-check består 9 forløb, og scenario-library-check består samtlige forløb ved 1440×900, 1024×768 og 390×844 med 0 axe-fund og 0 browserfejl. Screenshots og rigtige backup-/rapporteksporter er opdateret i `reports/flowlab`.
