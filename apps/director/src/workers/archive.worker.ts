/// <reference lib="webworker" />
import {
  exportPackage,
  importPackage,
  importProjectJsonBytes,
  type ArchiveProgress,
} from "../lib/project-archive";
import type { Project } from "@tre/scene-format";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (
  event: MessageEvent<
    | { kind: "export"; project: Project }
    | { kind: "import" | "json"; bytes: ArrayBuffer }
  >,
) => {
  const progress = (progress: ArchiveProgress) =>
    self.postMessage({ type: "progress", progress });
  try {
    if (event.data.kind === "export") {
      const bytes = await exportPackage(event.data.project, progress);
      self.postMessage({ type: "exported", bytes }, [bytes.buffer]);
    } else
      self.postMessage({
        type: "imported",
        project: await (
          event.data.kind === "json" ? importProjectJsonBytes : importPackage
        )(event.data.bytes, progress),
      });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Projektpakken kunne ikke behandles",
    });
  }
};
