import { describe, expect, it } from "vitest";
import {
  compareModels,
  ENGINE_VERSION,
  PRNG_VERSION,
  membershipTemplate,
  seedList,
} from "@tre/flow-engine";
import { hashJson, type Json } from "@tre/database";
import { executeFlowComparison, flowComparisonHandler } from "./executor";
import { FLOW_JOB_PROFILE, parseFlowJobInput } from "./input";

function fixture() {
  const baseline = membershipTemplate(),
    scenario = structuredClone(baseline);
  scenario.id += "-alternative";
  scenario.resources[0]!.capacity += 1;
  return {
    schemaVersion: 1 as const,
    profile: FLOW_JOB_PROFILE,
    engineVersion: ENGINE_VERSION,
    prngVersion: PRNG_VERSION,
    baseline,
    scenario,
    seeds: seedList(2026, 30),
  };
}
describe("bounded native FlowLab executor", () => {
  it("runs all 30 real paired seeds and exactly matches the browser engine", async () => {
    const input = fixture(),
      progress: number[] = [];
    const expected = await compareModels(input.baseline, input.scenario, {
      seeds: input.seeds,
    });
    const actual = await executeFlowComparison(input, {
      onProgress: (done, total) => {
        expect(total).toBe(30);
        progress.push(done);
      },
    });
    expect(progress).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(actual).toEqual(expected);
    const output = await flowComparisonHandler.run(input as unknown as Json, {
      signal: new AbortController().signal,
      idempotencyKey: "native-fixture",
      recordProviderReference: async () => {
        throw new Error("External providers are forbidden");
      },
    });
    expect(output.actualMinor).toBe(0);
    expect(output.manifest).toMatchObject({
      kind: "flow.comparison",
      paidProviderCalled: false,
      inputSha256: hashJson(parseFlowJobInput(input) as unknown as Json),
      resultSha256: hashJson(expected as unknown as Json),
    });
  });
  it("rejects duplicate seeds, wrong versions, semantic graph errors and oversized profiles without trimming", () => {
    const input = fixture();
    expect(() =>
      parseFlowJobInput({ ...input, seeds: Array(30).fill(7) }),
    ).toThrow("forskellige");
    expect(() =>
      parseFlowJobInput({ ...input, engineVersion: "future" }),
    ).toThrow();
    const invalid = structuredClone(input);
    invalid.baseline.edges[0]!.target = "missing";
    expect(() => parseFlowJobInput(invalid)).toThrow();
    const huge = structuredClone(input);
    huge.baseline.maxEvents = 250001;
    expect(() => parseFlowJobInput(huge)).toThrow("250.000");
    expect(huge.baseline.maxEvents).toBe(250001);
    const different = structuredClone(input);
    different.scenario.horizon += 1;
    expect(() => parseFlowJobInput(different)).toThrow("samme måleperiode");
  });
  it("terminates a running native thread on cancellation and emits no later progress", async () => {
    const controller = new AbortController(),
      progress: number[] = [];
    await expect(
      executeFlowComparison(fixture(), {
        signal: controller.signal,
        onProgress: (done) => {
          progress.push(done);
          controller.abort();
        },
      }),
    ).rejects.toMatchObject({ knownNoCharge: true });
    expect(progress).toEqual([1]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(progress).toEqual([1]);
    await expect(
      executeFlowComparison(fixture(), { signal: controller.signal }),
    ).rejects.toMatchObject({ knownNoCharge: true });
  });
  it("kills a thread at its actual deadline and refuses incomplete seedpairs", async () => {
    await expect(
      executeFlowComparison(fixture(), { deadlineMs: 1 }),
    ).rejects.toMatchObject({ kind: "permanent", knownNoCharge: true });
    const incomplete = fixture();
    incomplete.baseline.maxEvents = 1;
    await expect(executeFlowComparison(incomplete)).rejects.toMatchObject({
      kind: "permanent",
      knownNoCharge: true,
    });
  });
});
