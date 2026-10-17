import { z } from "zod";
import {
  ENGINE_VERSION,
  PRNG_VERSION,
  modelSchema,
  parseModel,
  type FlowModel,
} from "@tre/flow-engine";

/** A server profile is explicit and rejects excess work; it never trims an accepted model. */
export const FLOW_JOB_PROFILE = "flow-local-bounded/1" as const;
export const FLOW_JOB_INPUT_BYTES = 500_000;
export const FLOW_JOB_OUTPUT_BYTES = 8_000_000;
export const FLOW_JOB_DEADLINE_MS = 90_000;
export const flowJobInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: z.literal(FLOW_JOB_PROFILE),
    engineVersion: z.literal(ENGINE_VERSION),
    prngVersion: z.literal(PRNG_VERSION),
    baseline: modelSchema,
    scenario: modelSchema,
    seeds: z.array(z.number().int().min(0).max(0xffffffff)).length(30),
  })
  .strict();
export type FlowJobInput = z.infer<typeof flowJobInputSchema>;

function assertProfile(model: FlowModel) {
  const cases =
    model.arrivals.type === "explicit"
      ? model.arrivals.cases.length
      : model.arrivals.maxCases + model.arrivals.initialBacklog;
  const intervals = model.resources.reduce(
    (count, pool) => count + pool.calendar.length,
    0,
  );
  if (
    model.nodes.length > 20 ||
    model.resources.length > 10 ||
    model.edges.length > 60 ||
    cases > 2000 ||
    model.maxEvents > 250_000 ||
    intervals > 100 ||
    model.horizon > 31 * 24 * 3600_000
  )
    throw new Error(
      "Serverprofilen tillader højst 20 noder, 10 ressourcepuljer, 60 forbindelser, 2.000 sager, 250.000 events, 100 kalenderintervaller og 31 dage pr. model. Modellen er ikke ændret; brug en mindre model eller kør lokalt i browseren.",
    );
}
export function parseFlowJobInput(value: unknown): FlowJobInput {
  const input = flowJobInputSchema.parse(value);
  if (new Set(input.seeds).size !== 30)
    throw new Error("Serverjobbet kræver præcis 30 forskellige uint32-seeds.");
  // Full semantic validation includes graph reachability, bounded cycles and valid resource references.
  const baseline = parseModel(input.baseline),
    scenario = parseModel(input.scenario);
  assertProfile(baseline);
  assertProfile(scenario);
  if (
    baseline.horizon !== scenario.horizon ||
    baseline.observationStart !== scenario.observationStart
  )
    throw new Error(
      "Baseline og alternativ skal have samme måleperiode og warm-up.",
    );
  const checked = { ...input, baseline, scenario };
  if (
    new TextEncoder().encode(JSON.stringify(checked)).byteLength >
    FLOW_JOB_INPUT_BYTES
  )
    throw new Error("Serverjobbets låste input må højst fylde 500 KB.");
  return checked;
}
