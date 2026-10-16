# Shared local storage API

`@tre/persistence` exports `usePersistentDocument<T>(app, key, initial, validate?)`.

`initial: () => T` and `validate: (unknown) => T` MUST be stable module-level functions. Hook returns `{ data, setData, ready, saveState, savedAt, error, reload, flush }`.

`setData(value | previous => value)` persists through a serialized IndexedDB CAS queue. Display loading until `ready`; display `saveState` (loading/saving/saved/error/conflict), surface error and offer `reload` on conflict. Preserve unsaved data for export. `flush()` awaits pending saves. Cross-tab conflicts never silently overwrite data. This storage is explicitly demo/local, not cloud authentication or shared workspaces.

`downloadFile(filename, content: BlobPart, mime?)` creates a local download. App validates domain data before imports. Workspace package entrypoints contain TypeScript source and are transpiled by Next.

Coordinator owns this package and root config. Send proposed changes to coordinator.
