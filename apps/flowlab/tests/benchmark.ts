import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { cpus, totalmem, platform, release } from "node:os";
import {
  ENGINE_VERSION,
  simulate,
  seedList,
  type FlowModel,
} from "@tre/flow-engine";
const model: FlowModel = {
  schemaVersion: 1,
  id: "benchmark-10000",
  revision: 1,
  name: "10.000 sager / 20 noder",
  description: "Syntetisk performancecase",
  evidence: "synthetic",
  horizon: 28_800_000,
  observationStart: 0,
  maxEvents: 5_000_000,
  sla: 3_600_000,
  fixedAutomationCost: 0,
  arrivals: {
    type: "explicit",
    cases: Array.from({ length: 10000 }, (_, i) => ({
      id: `case-${String(i).padStart(5, "0")}`,
      time: i * 2800,
      caseType: "standard",
    })),
  },
  nodes: [],
  edges: [],
  resources: [],
};
model.nodes.push({
  id: "start",
  label: "Start",
  kind: "source",
  position: { x: 0, y: 0 },
  variableCost: 0,
  maxVisits: 20,
});
for (let i = 0; i < 18; i++) {
  model.nodes.push({
    id: `activity-${i}`,
    label: `Aktivitet ${i + 1}`,
    kind: "activity",
    position: { x: (i + 1) * 200, y: 0 },
    duration: { type: "triangular", min: 20_000, mode: 25_000, max: 40_000 },
    resourceId: `pool-${i}`,
    variableCost: 0,
    maxVisits: 20,
  });
  model.resources.push({
    id: `pool-${i}`,
    label: `Pool ${i + 1}`,
    capacity: 12,
    hourlyCost: 250,
    calendar: [],
  });
}
model.nodes.push({
  id: "end",
  label: "Slut",
  kind: "sink",
  position: { x: 3800, y: 0 },
  variableCost: 0,
  maxVisits: 20,
});
for (let i = 0; i < model.nodes.length - 1; i++)
  model.edges.push({
    id: `edge-${i}`,
    source: model.nodes[i].id,
    target: model.nodes[i + 1].id,
  });
const count = Number(process.argv[2] ?? 30);
const durations: number[] = [];
let events = 0;
let throughput = 0;
for (const seed of seedList(2026, count)) {
  const start = performance.now();
  const r = simulate({
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    model,
    seed,
  });
  durations.push(performance.now() - start);
  events += r.eventCount;
  throughput += r.metrics.throughput;
  if (
    r.status !== "completed" ||
    r.metrics.arrived !== r.metrics.throughput + r.metrics.backlog
  )
    throw new Error("Benchmark did not complete conservatively");
  console.log(
    JSON.stringify({
      replication: durations.length,
      ms: Math.round(durations.at(-1)!),
      events: r.eventCount,
      throughput: r.metrics.throughput,
      backlog: r.metrics.backlog,
    }),
  );
}
const report = {
  engineVersion: ENGINE_VERSION,
  recordedAt: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    platform: platform(),
    release: release(),
    node: process.version,
  },
  workload: {
    cases: 10000,
    nodes: 20,
    replications: count,
    resources: 18,
    mode: "normal",
    warmup: 0,
    hasTrace: false,
  },
  durationMs: durations,
  totalMs: durations.reduce((a, b) => a + b, 0),
  meanMs: durations.reduce((a, b) => a + b, 0) / durations.length,
  peakRssKiB: process.resourceUsage().maxRSS,
  events,
  meanThroughput: throughput / count,
};
writeFileSync(
  `reports/flowlab/benchmark-${count}.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
