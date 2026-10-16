import { ENGINE_VERSION, type FlowModel } from "./model";
import {
  simulate,
  type CaseResult,
  type SimulationResult,
  type TraceEvent,
} from "./engine";

export interface CaseEvidence {
  schemaVersion: 1;
  engineVersion: string;
  prngVersion: string;
  seed: number;
  model: FlowModel;
  caseId: string;
  case: CaseResult | null;
  runStatus: SimulationResult["status"];
  measuredUntil: number;
  events: TraceEvent[];
  workSegments: SimulationResult["resourceTimelines"];
  warningCodes: string[];
  timing: null | {
    elapsed: number;
    queue: number;
    plannedWait: number;
    work: number;
    calendarPause: number | null;
    completeWorkEvidence: boolean;
  };
}
/** Re-run the complete model with the same seed, retaining only one case's evidence.
 * All other cases still compete for capacity and consume their original random draws. */
export function inspectCase(
  model: FlowModel,
  seed: number,
  caseId: string,
): CaseEvidence {
  const run = simulate({
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    model,
    seed,
    trace: true,
    traceLimit: 100000,
    timelineLimit: 200000,
    evidenceCaseId: caseId,
  });
  const item = run.cases.find((row) => row.id === caseId) ?? null;
  const work = run.resourceTimelines.reduce(
    (sum, segment) => sum + segment.end - segment.start,
    0,
  );
  const elapsed = item
    ? (item.completedAt ?? run.measuredUntil) - item.arrival
    : 0;
  const completeWorkEvidence = !run.warningCodes.includes("timeline_limit");
  const calendarPause =
    item && completeWorkEvidence
      ? elapsed - item.queueTime - item.plannedWait - work
      : null;
  if (calendarPause !== null && calendarPause < 0)
    throw new Error(
      "Sagens tidsregnskab stemmer ikke. Hændelsesforløbet kan ikke vises som dokumentation.",
    );
  return {
    schemaVersion: 1,
    engineVersion: run.engineVersion,
    prngVersion: run.prngVersion,
    seed,
    model: structuredClone(model),
    caseId,
    case: item,
    runStatus: run.status,
    measuredUntil: run.measuredUntil,
    events: run.trace,
    workSegments: run.resourceTimelines,
    warningCodes: run.warningCodes,
    timing: item
      ? {
          elapsed,
          queue: item.queueTime,
          plannedWait: item.plannedWait,
          work,
          calendarPause,
          completeWorkEvidence,
        }
      : null,
  };
}
