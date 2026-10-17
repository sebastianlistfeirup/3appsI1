/// <reference lib="webworker" />
import { exportRunPackage, type RunPackageInput } from "../lib/run-package";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (event: MessageEvent<RunPackageInput>) => {
  try {
    const bytes = await exportRunPackage(event.data, (progress) =>
      self.postMessage({ type: "progress", progress }),
    );
    self.postMessage({ type: "exported", bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Arbejdspakken kunne ikke dannes.",
    });
  }
};
