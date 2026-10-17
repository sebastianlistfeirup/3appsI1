import { parentPort, workerData } from "node:worker_threads";
import { assertReportReady, compareModels } from "@tre/flow-engine";
import { FLOW_JOB_OUTPUT_BYTES, parseFlowJobInput } from "./input";

if (!parentPort)
  throw new Error("The comparison requires an isolated worker thread.");
const port = parentPort;
try {
  const input = parseFlowJobInput(workerData);
  const comparison = await compareModels(input.baseline, input.scenario, {
    seeds: input.seeds,
    onProgress(completed, total) {
      port.postMessage({ type: "progress", completed, total });
    },
  });
  assertReportReady(comparison);
  const serialized = JSON.stringify(comparison);
  if (Buffer.byteLength(serialized) > FLOW_JOB_OUTPUT_BYTES)
    throw new Error(
      "Resultatet fylder over 8 MB. Brug færre sager eller en mindre model; et delvist resultat er ikke godkendt.",
    );
  port.postMessage({ type: "completed", comparison });
} catch (error) {
  port.postMessage({
    type: "failed",
    message:
      error instanceof Error
        ? error.message
        : "Simuleringen kunne ikke fuldføres.",
  });
} finally {
  port.close();
}
