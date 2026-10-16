import { compareModels, seedList, type FlowModel } from "@tre/flow-engine";
let controller: AbortController | null = null;
self.onmessage = async (
  event: MessageEvent<{
    type: "run" | "cancel";
    baseline: FlowModel;
    scenario: FlowModel;
    seed: number;
    count: number;
  }>,
) => {
  if (event.data.type === "cancel") {
    controller?.abort();
    return;
  }
  if (controller) return;
  controller = new AbortController();
  try {
    const result = await compareModels(
      event.data.baseline,
      event.data.scenario,
      {
        seeds: seedList(event.data.seed, event.data.count),
        signal: controller.signal,
        onPair: (baseline, scenario) =>
          self.postMessage({ type: "pair", baseline, scenario }),
        onProgress: (done, total) =>
          self.postMessage({ type: "progress", done, total }),
      },
    );
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Beregningen kunne ikke gennemføres.",
    });
  } finally {
    controller = null;
  }
};
