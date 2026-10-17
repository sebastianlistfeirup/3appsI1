"use client";
import { useEffect, useState } from "react";
import type { Project } from "@tre/scene-format";
const cache = new WeakMap<Project, string>();
export function useSnapshotHash(project: Project, enabled: boolean) {
  const [result, setResult] = useState<{
    project: Project;
    hash?: string;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const known = cache.get(project);
    if (known) {
      setResult({ project, hash: known });
      return;
    }
    let worker: Worker | undefined;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (hash?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker?.terminate();
      if (hash) cache.set(project, hash);
      setResult({
        project,
        hash,
        ...(hash
          ? {}
          : {
              error:
                "Den præcise versionskontrol er ikke tilgængelig. Dine eksportfiler er bevaret.",
            }),
      });
    };
    try {
      worker = new Worker(
        new URL("../workers/snapshot.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<{ hash?: string }>) =>
        finish(
          event.data.hash && /^[a-f0-9]{64}$/.test(event.data.hash)
            ? event.data.hash
            : undefined,
        );
      worker.onerror = worker.onmessageerror = () => finish();
      timer = setTimeout(() => finish(), 15000);
      worker.postMessage(project);
    } catch {
      finish();
    }
    return () => {
      done = true;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [project, enabled]);
  return result?.project === project
    ? { hash: result.hash, error: result.error, pending: false }
    : { hash: undefined, error: undefined, pending: enabled };
}
