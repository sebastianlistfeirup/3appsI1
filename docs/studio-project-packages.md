# Studio One project packages

Studio's local project ZIP is an actual portable copy, including the brief history, tasks, immutable file versions, locked runs, deliveries, reviews, activity and provenance. No account, cloud storage or provider credentials are required.

## Format and compatibility

Exports use manifest schema version 2. `project.json` contains metadata; each file's bytes occur once under `versions/<version-id>.bin`. `brief.md` and `tasks.json` remain readable without Studio. The manifest records SHA-256 for the project metadata and every file, plus rights and provenance.

Import accepts version 1 packages from earlier builds and version 2 packages. Both paths verify hashes, byte counts, references, duplicate IDs, immutable version relationships and provenance before admitting a project. Invalid or truncated ZIPs leave the current workspace untouched. Archive entry paths cannot traverse directories, be absolute or repeat.

An imported project whose ID is already present opens a choice to create a separate copy. The new project receives its own identity and audit event; its complete imported history remains available and the original project stays unchanged. Import never silently overwrites a project.

## Limits and recovery

- File versions total at most 48 MB per project; metadata at most 4 MB.
- The upload dialog admits 2 MB per file. The portable schema accepts individual historic versions up to 10 MB.
- ZIP input is capped at 64 MB, expanded contents at 60 MB, and entries at 510.
- Packing, unpacking and hash checks run in a separate browser worker. The operation has a 60-second deadline and always releases the worker on completion, failure or cancellation. **Afbryd import/eksport** stops the worker; queued replies cannot apply a late import or start a download. You can retry immediately. Ordinary in-app navigation keeps the operation available in its progress banner; leaving the application releases it. A native file read already started by the browser can finish before cancellation is observed, but no worker is started or project admitted after that cancellation.
- New edits enforce the project budget. Previously saved data can still be read, including legacy documents that exceed the new budget; individual files remain downloadable if a legacy project is too large for a portable ZIP.

If the browser refuses a save or another tab has a newer revision, **Eksportér lokal kopi** packages the current in-memory project. It does not require the failed save to succeed. The message distinguishes the downloaded copy from data confirmed in browser storage. **Genindlæs gemt version** deliberately reloads the persisted version; export unsaved changes first.

UTF-8 files preserve a leading BOM, Danish characters and emoji through upload, preview and export. Locally authored unpaired UTF-16 surrogates are normalized once before their byte count and hash are recorded.

## Verification

`apps/studio/src/lib/archive.test.ts` covers v1/v2 compatibility, actual incompressible multi-megabyte data, metadata tampering, invalid ZIPs, budget rejection, independent copies and exact UTF-8 hashes. `tests/e2e/studio-archive.spec.ts` exercises actual browser workers, an 11.2 MB binary project, forced IndexedDB quota failure, cancellation after actual compression/parse/hash work (including late replies and retry), and duplicate import at desktop, tablet and mobile sizes. Each browser path runs in Chromium, Firefox and WebKit; accessibility results and screenshots are retained under `reports/studio`.

These packages provide local portability. They do not demonstrate a hosted backup, encrypted object store or recovery of files after the browser's data has already been removed.

## Afleveringskladder

Når input er låst til en manuel levering, gemmes titel, forklaring, filindhold, filnavn, valgt eksisterende filversion og markeringen af kendte fejl som en kladde. Gemmestatus i dialogen viser, om browserlagringen er bekræftet. Ændringer gemmes efter en kort skrivepause; lukning af dialogen lægger også den sidste ændring i projektet. Ved en lagerfejl bliver den aktuelle tekst i sessionen, og både kladden og projektpakken kan hentes. Genindlæs først siden, når det vigtige arbejde er eksporteret.

Kladden følger med ZIP-pakken og kan desuden hentes og indlæses som `studio-delivery-draft` JSON, højst 2 MB. Indlæsning genbruger indholdet i det aktuelle leveringsforløb og ændrer ikke dets låste input. Filreferencer fra et andet projekt afvises med henvisning til at importere hele projektpakken. Uafsluttede og tomme felter er tilladt i kladder.

Ved aflevering fjernes arbejds­kladden i samme ændring, som opretter den uforanderlige leverance og filversion. Ved annullering bevares kladden i historikken og kan hentes under Aktivitet. Den kan indlæses i et nyt forløb uden at genåbne det gamle. Kladdetekst indgår i projektets eksisterende grænse på 4 MB metadata. Ældre projektpakker uden kladder kan fortsat læses.
