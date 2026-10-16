"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  DocumentController,
  RevisionConflict,
  type LocalEnvelope,
} from "./controller";
export {
  RevisionConflict,
  type LocalEnvelope,
  type SaveState,
} from "./controller";

interface LocalDatabase extends DBSchema {
  documents: { key: string; value: LocalEnvelope<unknown> };
}
const databases = new Map<string, Promise<IDBPDatabase<LocalDatabase>>>();
function database(app: string) {
  const name = `tre-apps-${app}-v1`;
  let promise = databases.get(name);
  if (!promise) {
    promise = openDB<LocalDatabase>(name, 1, {
      upgrade(db) {
        db.createObjectStore("documents", { keyPath: "key" });
      },
    });
    databases.set(name, promise);
    promise.catch(() => {
      if (databases.get(name) === promise) databases.delete(name);
    });
  }
  return promise;
}
export async function loadDocument<T>(
  app: string,
  key: string,
): Promise<LocalEnvelope<T> | undefined> {
  return (await (await database(app)).get("documents", key)) as
    LocalEnvelope<T> | undefined;
}
export async function saveDocument<T>(
  app: string,
  key: string,
  data: T,
  expectedRevision: number,
): Promise<LocalEnvelope<T>> {
  const db = await database(app);
  const tx = db.transaction("documents", "readwrite");
  const previous = await tx.store.get(key);
  if ((previous?.revision ?? 0) !== expectedRevision) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new RevisionConflict();
  }
  const next: LocalEnvelope<T> = {
    schemaVersion: 1,
    key,
    revision: expectedRevision + 1,
    updatedAt: new Date().toISOString(),
    data,
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}
/** Local/demo storage only. Initial and validate must be module-level functions. */
export function usePersistentDocument<T>(
  app: string,
  key: string,
  initial: () => T,
  validate?: (value: unknown) => T,
) {
  const channel = useRef<{
    app: string;
    key: string;
    bc: BroadcastChannel;
  } | null>(null);
  const controller = useMemo(
    () =>
      new DocumentController<T>(
        {
          load: () => loadDocument<T>(app, key),
          save: (data, revision) => saveDocument(app, key, data, revision),
        },
        initial,
        validate,
        (revision) =>
          channel.current?.app === app && channel.current.key === key
            ? channel.current.bc.postMessage({ key, revision })
            : undefined,
      ),
    [app, key, initial, validate],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`tre-apps-${app}`);
      channel.current = { app, key, bc };
      bc.onmessage = (event) => {
        if (event.data?.key === key)
          controller.notifyRevision(event.data.revision);
      };
    }
    void controller.reload();
    return () => {
      channel.current?.bc.close();
      channel.current = null;
    };
  }, [app, key, controller]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const state = controller.getSnapshot().saveState;
      if (["saving", "error", "conflict"].includes(state))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [controller]);
  return {
    ...snapshot,
    setData: controller.setData,
    reload: controller.reload,
    flush: controller.flush,
  };
}

export function downloadFile(
  filename: string,
  content: BlobPart,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
