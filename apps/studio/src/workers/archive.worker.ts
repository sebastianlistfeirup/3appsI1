/// <reference lib="webworker" />
import {
  exportProject,
  importProject,
  type ArchiveProgress,
} from "../lib/archive";
import type { Project } from "../lib/model";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (
  event: MessageEvent<
    { kind: "export"; project: Project } | { kind: "import"; bytes: Uint8Array }
  >,
) => {
  const progress = (progress: ArchiveProgress) =>
    self.postMessage({ type: "progress", progress });
  try {
    if (event.data.kind === "export") {
      const bytes = await exportProject(event.data.project, progress);
      self.postMessage({ type: "exported", bytes }, [bytes.buffer]);
    } else
      self.postMessage({
        type: "imported",
        project: await importProject(event.data.bytes, progress),
      });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Projektpakken kunne ikke behandles.",
    });
  }
};
