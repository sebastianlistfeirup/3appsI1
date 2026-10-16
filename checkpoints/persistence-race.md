# Shared persistence: StrictMode read/write race

Director's actual Firefox and WebKit no-WebGL runs exposed a P1: automatic first-frame capture was saved as IndexedDB revision 2, while a second initial `reload()` applied the older revision 1 to the screen afterwards. The underlying saved data survived, but the visible project silently reverted.

Fixed by extracting a framework-independent per-document controller with one in-flight reload, serialized writes and a mutation counter. A late read cannot replace newer in-memory edits. Broadcast revisions reject stale reads. Save state remains `saving` until the last queued write commits, and `flush()` rejects real storage/conflict failures. Recovery exports should use the in-memory snapshot even when flush rejects. Database-open failures can be retried explicitly.

Seven deterministic regression cases pass: duplicate mount plus immediate capture, delayed read versus user edit, queued write status, quota failure, two-tab conflict/reload, newer broadcast during read, and invalid stored schema. The shared hook retains the same data/reload/setData interface; storage remains local demo IndexedDB. Cross-browser Studio suite and Director's original reproduction are being re-run at this checkpoint.
