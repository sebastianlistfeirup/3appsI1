import type {
  CaseEvidence,
  CaseResult,
  Comparison,
  TraceEvent,
} from "@tre/flow-engine";
export const caseStatus: Record<CaseResult["status"], string> = {
  completed: "Afsluttet",
  waiting: "Venter i kø",
  active: "Under behandling",
  planned_wait: "Planlagt vent",
  aborted: "Afbrudt",
};
export const eventLabels: Record<string, string> = {
  arrival: "Sagen ankommer",
  enter: "Trinnet nås",
  activity_start: "Behandling starter",
  activity_end: "Behandling slutter",
  wait_start: "Planlagt vent starter",
  wait_end: "Planlagt vent slutter",
  completed: "Sagen afsluttes",
  truncated: "Besøgsgrænsen er nået",
};
export function pairCases(comparison: Comparison) {
  const a = new Map(
      comparison.baselineRuns[0]?.cases.map((item) => [item.id, item]) ?? [],
    ),
    b = new Map(
      comparison.scenarioRuns[0]?.cases.map((item) => [item.id, item]) ?? [],
    );
  return [...new Set([...a.keys(), ...b.keys()])].map((id) => ({
    id,
    baseline: a.get(id) ?? null,
    scenario: b.get(id) ?? null,
  }));
}
export type CasePair = ReturnType<typeof pairCases>[number];
export function caseElapsed(item: CaseResult | null, measuredUntil: number) {
  return item ? (item.completedAt ?? measuredUntil) - item.arrival : null;
}
export function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  const unit =
    Math.abs(ms) < 1000
      ? { scale: 1, label: "ms" }
      : Math.abs(ms) < 60000
        ? { scale: 1000, label: "sek." }
        : Math.abs(ms) < 3600000
          ? { scale: 60000, label: "min" }
          : { scale: 3600000, label: "t" };
  return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 }).format(ms / unit.scale)} ${unit.label}`;
}
export function eventVisit(event: TraceEvent): number | null {
  try {
    const tuple = JSON.parse(event.visitId);
    return Array.isArray(tuple) && Number.isInteger(tuple[2]) && tuple[2] > 0
      ? tuple[2]
      : null;
  } catch {
    return null;
  }
}
export function caseEvidenceMatches(
  evidence: CaseEvidence,
  expected: CaseResult | null | undefined,
): boolean {
  // A rerun must reproduce the retained first-pair case before it can explain that result.
  if (!evidence.case || !expected) return !evidence.case && !expected;
  return (Object.keys(evidence.case) as (keyof CaseResult)[]).every(
    (key) => evidence.case![key] === expected[key],
  );
}
