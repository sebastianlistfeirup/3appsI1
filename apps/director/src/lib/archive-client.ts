import type { Project } from "@tre/scene-format";
import type { ArchiveProgress } from "./project-archive";
import { ARCHIVE_LIMITS } from "./project-file-limits";
export interface ArchiveOptions {
  signal?: AbortSignal;
  onProgress?: (value: ArchiveProgress) => void;
}
type Request =
  | { kind: "export"; project: Project }
  | { kind: "import" | "json"; bytes: ArrayBuffer };
function run(
  request: Request,
  options: ArchiveOptions = {},
): Promise<Project | Uint8Array> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      new DOMException(
        "Projektpakken er afbrudt. Din film er bevaret.",
        "AbortError",
      );
    if (options.signal?.aborted) return reject(aborted());
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/archive.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(
        Error(
          "Browseren kunne ikke starte projektarbejdet i baggrunden. Din film er bevaret.",
        ),
      );
      return;
    }
    let finished = false;
    const cleanup = () => {
      if (finished) return false;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      worker.terminate();
      return true;
    };
    const cancel = () => {
      if (cleanup()) reject(aborted());
    };
    const timer = setTimeout(() => {
      if (cleanup())
        reject(
          Error(
            "Projektpakken tog mere end ét minut. Din film er bevaret; prøv igen med færre programmer åbne.",
          ),
        );
    }, 60000);
    options.signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        type: string;
        progress: ArchiveProgress;
        message: string;
        bytes: Uint8Array;
        project: Project;
      }>,
    ) => {
      if (finished) return;
      if (event.data.type === "progress") {
        options.onProgress?.(event.data.progress);
        return;
      }
      if (!cleanup()) return;
      if (event.data.type === "exported") resolve(event.data.bytes);
      else if (event.data.type === "imported") resolve(event.data.project);
      else
        reject(
          Error(
            event.data.type === "error"
              ? event.data.message
              : "Projektpakken gav et ukendt svar",
          ),
        );
    };
    worker.onerror = () => {
      if (cleanup())
        reject(
          Error(
            "Projektpakken kunne ikke behandles i baggrunden. Din film er bevaret.",
          ),
        );
    };
    worker.onmessageerror = () => {
      if (cleanup())
        reject(
          Error(
            "Projektpakken kunne ikke overføres fra baggrundsarbejdet. Din film er bevaret.",
          ),
        );
    };
    try {
      worker.postMessage(
        request,
        request.kind !== "export" ? [request.bytes] : [],
      );
    } catch (error) {
      if (cleanup()) reject(error);
    }
  });
}
export async function exportProjectArchive(
  project: Project,
  options?: ArchiveOptions,
) {
  return (await run({ kind: "export", project }, options)) as Uint8Array;
}
export async function importProjectArchive(
  bytes: ArrayBuffer,
  options?: ArchiveOptions,
) {
  return (await run({ kind: "import", bytes }, options)) as Project;
}
/** Check the original File size before reading, then transfer parsing/hash checks to the worker. */
export async function importProjectFile(file: File, options?: ArchiveOptions) {
  const zip = file.name.toLowerCase().endsWith(".zip");
  const limit = zip
    ? ARCHIVE_LIMITS.archiveBytes
    : ARCHIVE_LIMITS.expandedProjectBytes;
  if (file.size > limit)
    throw Error(
      zip
        ? "Projektpakken må højst være 100 MiB"
        : "Projekt-JSON må højst være 150 MiB",
    );
  const bytes = await file.arrayBuffer();
  return (await run(
    { kind: zip ? "import" : "json", bytes },
    options,
  )) as Project;
}
export function archiveProgressLabel(value: ArchiveProgress) {
  if (value.phase === "packing") return "Pakker filmens originale filer …";
  if (value.phase === "unpacking") return "Åbner projektpakken i baggrunden …";
  return `Kontrollerer fil ${Math.min(value.completed, value.total)} af ${value.total} …`;
}
