/// <reference lib="webworker" />
import {
  exportWorkspace,
  importWorkspace,
  type WorkspaceArchiveProgress,
} from "../lib/workspace-archive";
import type { Studio } from "../lib/model";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (
  event: MessageEvent<
    | { kind: "export"; studio: Studio; projectIds: string[] }
    | { kind: "import"; bytes: Uint8Array }
  >,
) => {
  const progress = (value: WorkspaceArchiveProgress) =>
    self.postMessage({ type: "progress", progress: value });
  try {
    if (event.data.kind === "export") {
      const bytes = await exportWorkspace(
        event.data.studio,
        event.data.projectIds,
        progress,
      );
      self.postMessage({ type: "exported", bytes }, [bytes.buffer]);
    } else
      self.postMessage({
        type: "imported",
        archive: await importWorkspace(event.data.bytes, progress),
      });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Backupfilen kunne ikke behandles.",
    });
  }
};
