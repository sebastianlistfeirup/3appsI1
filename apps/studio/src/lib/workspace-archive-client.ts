import type { Studio } from "./model";
import { assertWorkspaceTransferBudget } from "./workspace-archive";
import type {
  WorkspaceArchive,
  WorkspaceArchiveProgress,
} from "./workspace-archive";
type Request =
  | { kind: "export"; studio: Studio; projectIds: string[] }
  | { kind: "import"; bytes: Uint8Array };
function run(
  request: Request,
  signal: AbortSignal,
  progress: (value: WorkspaceArchiveProgress) => void,
): Promise<Uint8Array | WorkspaceArchive> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Backup afbrudt.", "AbortError"));
    const worker = new Worker(
      new URL("../workers/workspace-archive.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (value?: Uint8Array | WorkspaceArchive, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      finish(
        undefined,
        new DOMException(
          "Backup afbrudt. Dine projekter er bevaret.",
          "AbortError",
        ),
      );
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            "Backupfilen tog over to minutter. Vælg færre projekter. Dine projekter er bevaret.",
          ),
        ),
      120_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === "progress") return progress(data.progress);
      if (data.type === "exported") finish(data.bytes);
      else if (data.type === "imported") finish(data.archive);
      else
        finish(
          undefined,
          new Error(data.message ?? "Backupfilen gav et ukendt svar."),
        );
    };
    worker.onerror = () =>
      finish(
        undefined,
        new Error(
          "Backupfilens baggrundsarbejde fejlede. Dine projekter er bevaret.",
        ),
      );
    worker.onmessageerror = () =>
      finish(
        undefined,
        new Error("Backupfilen kunne ikke overføres fra baggrundsarbejdet."),
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
export async function exportWorkspaceFile(
  studio: Studio,
  projectIds: string[],
  signal: AbortSignal,
  progress: (value: WorkspaceArchiveProgress) => void,
) {
  // Transfer only selected projects. An oversized unrelated project never gets cloned into this worker.
  const selected = studio.projects.filter((p) => projectIds.includes(p.id));
  assertWorkspaceTransferBudget(selected);
  return (await run(
    {
      kind: "export",
      studio: {
        ...studio,
        projects: selected,
      },
      projectIds,
    },
    signal,
    progress,
  )) as Uint8Array;
}
export async function importWorkspaceFile(
  bytes: Uint8Array,
  signal: AbortSignal,
  progress: (value: WorkspaceArchiveProgress) => void,
) {
  return (await run(
    { kind: "import", bytes },
    signal,
    progress,
  )) as WorkspaceArchive;
}
