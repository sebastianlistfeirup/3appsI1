'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface LocalEnvelope<T> { schemaVersion: 1; key: string; revision: number; updatedAt: string; data: T }
interface LocalDatabase extends DBSchema { documents: { key: string; value: LocalEnvelope<unknown> } }
export class RevisionConflict extends Error { constructor() { super('En nyere version er gemt i en anden fane. Hent den nye version, eller eksportér dine ændringer som en kopi.'); this.name = 'RevisionConflict'; } }
const databases = new Map<string, Promise<IDBPDatabase<LocalDatabase>>>();
function database(app: string) { const name = `tre-apps-${app}-v1`; let promise = databases.get(name); if (!promise) { promise = openDB<LocalDatabase>(name, 1, { upgrade(db) { db.createObjectStore('documents', { keyPath: 'key' }); } }); databases.set(name, promise); } return promise; }
export async function loadDocument<T>(app: string, key: string): Promise<LocalEnvelope<T> | undefined> { return (await (await database(app)).get('documents', key)) as LocalEnvelope<T> | undefined; }
export async function saveDocument<T>(app: string, key: string, data: T, expectedRevision: number): Promise<LocalEnvelope<T>> { const db = await database(app); const tx = db.transaction('documents', 'readwrite'); const previous = await tx.store.get(key); if ((previous?.revision ?? 0) !== expectedRevision) { tx.abort(); await tx.done.catch(() => undefined); throw new RevisionConflict(); } const next: LocalEnvelope<T> = { schemaVersion: 1, key, revision: expectedRevision + 1, updatedAt: new Date().toISOString(), data }; await tx.store.put(next); await tx.done; return next; }
export type SaveState = 'loading' | 'saving' | 'saved' | 'error' | 'conflict';
/** Local/demo storage only. Initial and validate must be module-level functions. */
export function usePersistentDocument<T>(app: string, key: string, initial: () => T, validate?: (value: unknown) => T) {
  const [data, rawSetData] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dataRef = useRef(data); const revision = useRef(0); const blocked = useRef(false); const queue = useRef(Promise.resolve()); const channel = useRef<BroadcastChannel | null>(null); const mounted = useRef(true);
  const apply = useCallback((next: T) => { dataRef.current = next; rawSetData(next); }, []);
  const reload = useCallback(async () => {
    await queue.current; setSaveState('loading');
    try { let envelope = await loadDocument<T>(app, key); if (!envelope) { try { envelope = await saveDocument(app, key, initial(), 0); } catch (e) { if (!(e instanceof RevisionConflict)) throw e; envelope = await loadDocument<T>(app, key); } } if (!envelope) throw new Error('Projektet kunne ikke åbnes.'); if (envelope.schemaVersion !== 1) throw new Error('Denne filversion understøttes ikke.'); const next = validate ? validate(envelope.data) : envelope.data; if (!mounted.current) return; revision.current = envelope.revision; apply(next); setSavedAt(envelope.updatedAt); setError(null); blocked.current = false; setSaveState('saved'); setReady(true); }
    catch (e) { if (!mounted.current) return; blocked.current = true; setError(e instanceof Error ? e.message : 'Lokal lagring er ikke tilgængelig.'); setSaveState('error'); }
  }, [app, key, initial, validate, apply]);
  useEffect(() => { mounted.current = true; void reload(); if (typeof BroadcastChannel !== 'undefined') { const bc = new BroadcastChannel(`tre-apps-${app}`); channel.current = bc; bc.onmessage = event => { if (event.data?.key === key && event.data.revision > revision.current) { blocked.current = true; setSaveState('conflict'); setError(new RevisionConflict().message); } }; } return () => { mounted.current = false; channel.current?.close(); channel.current = null; }; }, [app, key, reload]);
  const setData = useCallback((update: T | ((previous: T) => T)) => {
    const next = typeof update === 'function' ? (update as (previous: T) => T)(dataRef.current) : update;
    const checked = validate ? validate(next) : next;
    apply(checked); if (blocked.current) return; setSaveState('saving');
    queue.current = queue.current.then(async () => { if (blocked.current) return; try { const envelope = await saveDocument(app, key, checked, revision.current); revision.current = envelope.revision; if (mounted.current) { setSavedAt(envelope.updatedAt); setSaveState('saved'); setError(null); } channel.current?.postMessage({ key, revision: envelope.revision }); } catch (e) { blocked.current = true; if (mounted.current) { setError(e instanceof Error ? e.message : 'Kunne ikke gemme. Eksportér en kopi af dit arbejde.'); setSaveState(e instanceof RevisionConflict ? 'conflict' : 'error'); } } });
  }, [app, key, apply, validate]);
  const flush = useCallback(() => queue.current, []);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (saveState === 'saving' || saveState === 'error' || saveState === 'conflict') { event.preventDefault(); } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [saveState]);
  return { data, setData, ready, saveState, savedAt, error, reload, flush };
}

export function downloadFile(filename: string, content: BlobPart, type = 'application/json') { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
