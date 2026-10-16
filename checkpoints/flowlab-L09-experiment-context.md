# L09 — Eksperimentets oprindelige kontekst

Udført 2026-10-16 i `task/L01-flowlab-core`.

## Leveret

- Fælles seed er nu en valideret del af arbejdsrummet, genindlæses fra IndexedDB, indgår i backup/import og kan fortrydes. Den valgte seedliste skal matche den fuldførte sammenligning, før en aktuel rapport kan eksporteres.
- Nye immutable versionssnapshots gemmer navn på alternativ, hypotese og fælles seed sammen med begge modeller. Gendan bevarer brugerens senere beslutning. Ældre snapshots uden kontekst kan stadig importeres/gendannes med en tydelig besked.
- Ved kørslens start fryses hypotese, navn, fælles seed, tidspunkt og kendte træningsdatakilder. Redigering under/efter kørsel ændrer ikke dette grundlag. Efterfølgende rapporttekst er tilladt, men ændringen fremgår af UI, PDF og JSON; den oprindelige hypotese følger med.
- Importerede modelpakker med beregnede resultater eller kørselskontekst bruges fortsat kun som input: simulation genberegnes, og importeret dokumentation kan ikke udgive sig for en ny beregning.

## Verificeret

- `pnpm --filter @tre/flowlab typecheck` og `pnpm --filter @tre/flowlab build`: grønne.
- `pnpm exec vitest run packages/flow-engine/src apps/flowlab/src/lib packages/persistence/src`: 77 tests grønne, herunder seed-gate, bagudkompatibel migration, snapshots og uforanderlig hypotese.
- `pnpm exec tsx apps/flowlab/tests/experiment-check.ts`: Chromium, Firefox og WebKit med virkelige 30 parrede golden-kørsler på 1440×900, 1024×768 og 390×844. Custom seed overlever reload; seedændring blokerer rapport; snapshot gendanner korrekt; efterfølgende beslutning bevares; faktisk ZIP/JSON/indlejret PDF har original hypotese og korrekt seedliste. Axe WCAG2A/AA/21AA: 0 fund; ingen viewportoverflow eller browserfejl.
- `pnpm exec tsx apps/flowlab/tests/report-layout-check.ts`: 8 sider / 571 tekstord, alle inden for sidens marginer. Lange navne, 4.000 tegn hypotese og knap 10.000 tegn beslutning bevaret.
- Bevisfiler: `reports/flowlab/{chromium,firefox,webkit}-experiment-check.json`, tilsvarende desktop/tablet/mobile PNG og PDF, `engine-tests.txt`, `report-layout-check.json`.

## Grænser

Kørslers beregnede beviser er fortsat lokale. En ældre fuldført kørsel, der blev gemt før L09, har ingen registreret original hypotese; `runContext` er eksplicit `null`. Egen beslutning er efterfølgende rapporttekst, ikke en låst antagelse. Ingen cloud- eller kalibreringspåstand tilføjet.
