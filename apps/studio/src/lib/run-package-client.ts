import type { Project } from "./model";
import type { ArchiveProgress } from "./archive";
import { runPackageInput } from "./run-package";

export function exportRunPackageFile(
  project: Project,
  runId: string,
  signal: AbortSignal,
  progress: (value: ArchiveProgress) => void,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(
        new DOMException("Arbejdspakken er afbrudt.", "AbortError"),
      );
    // Clone only the exact selected input versions, never the whole project.
    const input = runPackageInput(project, runId);
    const worker = new Worker(
      new URL("../workers/run-package.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (bytes?: Uint8Array, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(bytes!);
    };
    const abort = () =>
      finish(
        undefined,
        new DOMException(
          "Arbejdspakken er afbrudt. Forløbet er bevaret.",
          "AbortError",
        ),
      );
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            "Arbejdspakken tog over ét minut. Forløbet og filerne er bevaret.",
          ),
        ),
      60_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === "progress") progress(event.data.progress);
      else if (event.data.type === "exported") finish(event.data.bytes);
      else
        finish(
          undefined,
          new Error(event.data.message ?? "Arbejdspakken gav et ukendt svar."),
        );
    };
    worker.onerror = () =>
      finish(undefined, new Error("Arbejdspakkens baggrundsarbejde fejlede."));
    worker.onmessageerror = () =>
      finish(
        undefined,
        new Error("Arbejdspakken kunne ikke overføres fra baggrundsarbejdet."),
      );
    try {
      worker.postMessage(input);
    } catch (error) {
      finish(undefined, error);
    }
  });
}
