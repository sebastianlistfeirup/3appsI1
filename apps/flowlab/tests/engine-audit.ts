import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ENGINE_VERSION,
  membershipTemplate,
  simulate,
  goldenModel,
  type FlowModel,
} from "../../../packages/flow-engine/src/index";
const temporary = mkdtempSync(join(tmpdir(), "flowlab-reference-"));
try {
  const oldSource = execFileSync(
    "git",
    ["show", "8d21bf7:packages/flow-engine/src/engine.ts"],
    { encoding: "utf8" },
  )
    .replaceAll(
      '"./model"',
      JSON.stringify(join(process.cwd(), "packages/flow-engine/src/model.ts")),
    )
    .replaceAll(
      '"./random"',
      JSON.stringify(join(process.cwd(), "packages/flow-engine/src/random.ts")),
    );
  const path = join(temporary, "engine.ts");
  writeFileSync(path, oldSource);
  const reference = require(path) as { simulate: typeof simulate };
  const results = [];
  for (let i = 0; i < 60; i++) {
    const model = membershipTemplate();
    model.horizon = 3600000 * (1 + (i % 8));
    model.resources[0].capacity = i % 6;
    model.resources[1].capacity = 1 + (i % 3);
    model.arrivals = {
      type: "poisson",
      meanInterval: 20000 + (i % 7) * 60000,
      maxCases: 2000,
      initialBacklog: i % 15,
    };
    if (i % 3 === 0)
      model.resources[0].calendar = [
        { start: 0, end: 900000 },
        { start: 1800000, end: model.horizon },
      ].filter((slot) => slot.end > slot.start);
    model.nodes.find((n) => n.id === "process")!.duration = {
      type: "triangular",
      min: 1000,
      mode: 120000 + i * 1000,
      max: 900000,
    };
    model.edges.find((e) => e.id === "e3")!.weight = 0.3;
    const input = {
      schemaVersion: 1 as const,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 100 + i,
      trace: true,
      traceLimit: 100000,
    };
    const old = reference.simulate(input),
      current = simulate(input);
    const normalize = (result: typeof current) =>
      JSON.stringify({
        ...result,
        // v1.3 uses an unambiguous tuple ID; these fixture IDs have no colons.
        trace: result.trace.map((event) => ({
          ...event,
          visitId: event.visitId.startsWith("[")
            ? event.visitId
            : JSON.stringify([
                event.caseId,
                event.nodeId,
                Number(event.visitId.split(":").at(-1)),
              ]),
        })),
        resourceTimelines: result.resourceTimelines.map(
          ({ visitId: _visitId, ...segment }) => segment,
        ),
        queueSamples: result.queueSamples.map((sample) => ({
          ...sample,
          byNode: Object.fromEntries(Object.entries(sample.byNode).sort()),
        })),
        cases: result.cases.map((c) => ({
          ...c,
          queueTime: c.status === "waiting" ? 0 : c.queueTime,
        })),
      });
    if (normalize(old) !== normalize(current))
      throw new Error(`Differential mismatch in configuration ${i}`);
    results.push({
      configuration: i,
      seed: input.seed,
      events: current.eventCount,
      throughput: current.metrics.throughput,
      backlog: current.metrics.backlog,
      status: current.status,
    });
  }
  const model = goldenModel();
  model.horizon = 100000;
  model.maxEvents = 1000000;
  model.nodes[1].duration = { type: "fixed", value: 1 };
  model.arrivals = {
    type: "explicit",
    cases: Array.from({ length: 100000 }, (_, i) => ({
      id: `burst-${String(i).padStart(6, "0")}`,
      time: 0,
      caseType: "standard",
    })),
  };
  const start = performance.now(),
    result = simulate({
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      model,
      seed: 1,
    });
  const durationMs = performance.now() - start;
  if (
    result.status !== "completed" ||
    result.metrics.throughput !== 100000 ||
    result.metrics.backlog !== 0 ||
    result.metrics.utilization !== 1
  )
    throw new Error("Overload conservation failure");
  writeFileSync(
    "reports/flowlab/engine-audit.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        engineVersion: ENGINE_VERSION,
        referenceCommit: "8d21bf7",
        excludedFromDifferential:
          "Only queueTime on censored waiting cases: new version intentionally records elapsed waiting.",
        configurations: results,
        burst: {
          cases: 100000,
          nodes: 3,
          capacity: 1,
          serviceMs: 1,
          durationMs,
          events: result.eventCount,
          metrics: result.metrics,
          peakRssKiB: process.resourceUsage().maxRSS,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      differentialConfigurations: results.length,
      burstDurationMs: durationMs,
      burstThroughput: result.metrics.throughput,
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
