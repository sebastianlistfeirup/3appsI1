import {
  ENGINE_VERSION,
  PRNG_VERSION,
  inspectCase,
  type FlowModel,
} from "@tre/flow-engine";
self.onmessage = (
  event: MessageEvent<{
    engineVersion: string;
    prngVersions: string[];
    baseline: FlowModel;
    scenario: FlowModel;
    seed: number;
    caseId: string;
  }>,
) => {
  const input = event.data;
  try {
    if (
      input.engineVersion !== ENGINE_VERSION ||
      !Array.isArray(input.prngVersions) ||
      input.prngVersions.length !== 2 ||
      input.prngVersions.some((version) => version !== PRNG_VERSION)
    )
      throw new Error(
        "Resultatet er fra en tidligere motorversion eller PRNG-version. Kør sammenligningen igen, før du undersøger hændelserne.",
      );
    const baseline = inspectCase(input.baseline, input.seed, input.caseId),
      scenario = inspectCase(input.scenario, input.seed, input.caseId);
    self.postMessage({ type: "result", baseline, scenario });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Hændelsesforløbet kunne ikke genberegnes.",
    });
  }
};
