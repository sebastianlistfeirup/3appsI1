import type { FlowModel, FlowNode } from "@tre/flow-engine";
import { formatNumber } from "./document";

type Point = { x: number; y: number };
const durationText = (ms: number) =>
  ms < 1000
    ? `${formatNumber(ms)} ms`
    : ms < 60000
      ? `${formatNumber(ms / 1000, 1)} sek`
      : `${formatNumber(ms / 60000, 1)} min`;

/** Only presentation changes. Model edges never acquire UI handle ids. */
export function diagramHandles(source: Point, target: Point, self = false) {
  if (self) return { sourceHandle: "source-right", targetHandle: "target-top" };
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dy) > Math.abs(dx))
    return dy >= 0
      ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
      : { sourceHandle: "source-top", targetHandle: "target-bottom" };
  return dx >= 0
    ? { sourceHandle: "source-right", targetHandle: "target-left" }
    : { sourceHandle: "source-left", targetHandle: "target-right" };
}

function durationLabel(node: FlowNode) {
  const distribution = node.duration;
  if (!distribution) return "—";
  const ms =
    distribution.type === "fixed"
      ? distribution.value
      : distribution.type === "triangular"
        ? distribution.mode
        : distribution.mean;
  const time = durationText(ms);
  return `${distribution.type === "triangular" ? "Typisk " : distribution.type === "exponential" ? "Gns. " : ""}${time}`;
}

export function diagramNodeDetail(
  node: FlowNode,
  model: FlowModel,
): { primary: string; secondary?: string } {
  if (node.kind === "source") {
    if (model.arrivals.type === "poisson") {
      const ms = model.arrivals.meanInterval;
      const interval = durationText(ms);
      return {
        primary: `Gns. ${interval} mellem nye sager`,
        secondary: `Loft ${formatNumber(model.arrivals.maxCases)} nye · ${formatNumber(model.arrivals.initialBacklog)} i startrestkø`,
      };
    }
    const inside = model.arrivals.cases.filter(
      (entry) => entry.time < model.horizon,
    ).length;
    const outside = model.arrivals.cases.length - inside;
    return {
      primary: `${formatNumber(inside)} ${inside === 1 ? "ankomst" : "ankomster"} i perioden`,
      ...(outside
        ? { secondary: `${formatNumber(outside)} uden for perioden` }
        : {}),
    };
  }
  if (node.kind === "activity") {
    const capacity = model.resources.find(
      (resource) => resource.id === node.resourceId,
    )?.capacity;
    return {
      primary: `${durationLabel(node)} · ${capacity === undefined ? "ukendt pulje" : `${formatNumber(capacity)} ${capacity === 1 ? "medarbejder" : "medarbejdere"}`}`,
    };
  }
  if (node.kind === "wait")
    return { primary: durationLabel(node), secondary: "Uden ressourceforbrug" };
  if (node.kind === "rework")
    return { primary: `Højst ${node.maxVisits} besøg` };
  if (node.kind === "sink") return { primary: "Unikke afsluttede sager" };
  return { primary: "Eksplicit routing" };
}
