import type { ArchiveProgress } from "./archive";
import type { Project } from "./model";
type Request =
  { kind: "export"; project: Project } | { kind: "import"; bytes: Uint8Array };
function run(
  request: Request,
  progress?: (value: ArchiveProgress) => void,
  signal?: AbortSignal,
): Promise<Project | Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(
        new DOMException("Projektpakken er afbrudt.", "AbortError"),
      );
    const worker = new Worker(
      new URL("../workers/archive.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (value?: Project | Uint8Array, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      finish(
        undefined,
        new DOMException("Projektpakken er afbrudt.", "AbortError"),
      );
    const timer = setTimeout(() => {
      finish(
        undefined,
        new Error(
          "Projektpakken tog for lang tid. Dine oprindelige data er bevaret. Prøv igen med færre programmer åbne.",
        ),
      );
    }, 60000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        type: string;
        progress: ArchiveProgress;
        message: string;
        bytes: Uint8Array;
        project: Project;
      }>,
    ) => {
      if (settled) return;
      if (event.data.type === "progress") {
        progress?.(event.data.progress);
        return;
      }
      if (event.data.type === "error")
        finish(undefined, new Error(event.data.message));
      else if (event.data.type === "exported") finish(event.data.bytes);
      else if (event.data.type === "imported") finish(event.data.project);
      else finish(undefined, new Error("Projektpakken gav et ukendt svar."));
    };
    worker.onerror = () =>
      finish(
        undefined,
        new Error(
          "Projektpakken kunne ikke behandles. Dine oprindelige data er bevaret.",
        ),
      );
    worker.onmessageerror = () =>
      finish(
        undefined,
        new Error("Projektpakken kunne ikke overføres fra baggrundsarbejdet."),
      );
    try {
      worker.postMessage(
        request,
        request.kind === "import" ? [request.bytes.buffer] : [],
      );
    } catch (error) {
      finish(undefined, error);
    }
  });
}
export async function exportProjectFile(
  project: Project,
  progress?: (value: ArchiveProgress) => void,
  signal?: AbortSignal,
) {
  return (await run(
    { kind: "export", project },
    progress,
    signal,
  )) as Uint8Array;
}
export async function importProjectFile(
  bytes: Uint8Array,
  progress?: (value: ArchiveProgress) => void,
  signal?: AbortSignal,
) {
  return (await run({ kind: "import", bytes }, progress, signal)) as Project;
}
export function progressLabel(value: ArchiveProgress | null) {
  if (!value) return "Åbner projektpakken…";
  if (value.phase === "packing") return "Pakker filer og historik…";
  if (value.phase === "unpacking") return "Åbner projektpakken…";
  return `Kontrollerer fil ${Math.min(value.completed + 1, value.total)} af ${value.total}…`;
}
