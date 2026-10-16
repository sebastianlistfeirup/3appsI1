import type { ArchiveProgress } from "./archive";
import type { Project } from "./model";
type Request =
  { kind: "export"; project: Project } | { kind: "import"; bytes: Uint8Array };
function run(
  request: Request,
  progress?: (value: ArchiveProgress) => void,
): Promise<Project | Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/archive.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new Error(
          "Projektpakken tog for lang tid. Dine oprindelige data er bevaret. Prøv igen med færre programmer åbne.",
        ),
      );
    }, 60000);
    worker.onmessage = (
      event: MessageEvent<{
        type: string;
        progress: ArchiveProgress;
        message: string;
        bytes: Uint8Array;
        project: Project;
      }>,
    ) => {
      if (event.data.type === "progress") {
        progress?.(event.data.progress);
        return;
      }
      finish();
      if (event.data.type === "error") reject(new Error(event.data.message));
      else if (event.data.type === "exported") resolve(event.data.bytes);
      else if (event.data.type === "imported") resolve(event.data.project);
      else reject(new Error("Projektpakken gav et ukendt svar."));
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "Projektpakken kunne ikke behandles. Dine oprindelige data er bevaret.",
        ),
      );
    };
    worker.onmessageerror = () => {
      finish();
      reject(
        new Error("Projektpakken kunne ikke overføres fra baggrundsarbejdet."),
      );
    };
    try {
      worker.postMessage(
        request,
        request.kind === "import" ? [request.bytes.buffer] : [],
      );
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
export async function exportProjectFile(
  project: Project,
  progress?: (value: ArchiveProgress) => void,
) {
  return (await run({ kind: "export", project }, progress)) as Uint8Array;
}
export async function importProjectFile(
  bytes: Uint8Array,
  progress?: (value: ArchiveProgress) => void,
) {
  return (await run({ kind: "import", bytes }, progress)) as Project;
}
export function progressLabel(value: ArchiveProgress | null) {
  if (!value) return "Åbner projektpakken…";
  if (value.phase === "packing") return "Pakker filer og historik…";
  if (value.phase === "unpacking") return "Åbner projektpakken…";
  return `Kontrollerer fil ${Math.min(value.completed + 1, value.total)} af ${value.total}…`;
}
