import {
  inputDiff,
  type FlowModel,
  type InputDifference,
} from "@tre/flow-engine";

export const DIFF_PAGE_SIZE = 20;
export function modelInputDifferences(
  baseline: FlowModel,
  scenario: FlowModel,
) {
  return inputDiff(baseline, scenario).filter(
    (difference) =>
      !["revision", "id"].includes(difference.path) &&
      !/^nodes\.\d+\.position\./.test(difference.path),
  );
}
const labels: Record<string, string> = {
  name: "Modelnavn",
  description: "Modelbeskrivelse",
  evidence: "Evidensmærke",
  horizon: "Simulationsstop (ms)",
  observationStart: "Målestart (ms)",
  maxEvents: "Hændelsesloft",
  sla: "SLA (ms)",
  fixedAutomationCost: "Fast automation (kr.)",
  "arrivals.type": "Ankomstmetode",
  "arrivals.meanInterval": "Gennemsnitligt ankomstinterval (ms)",
  "arrivals.maxCases": "Loft for nye sager",
  "arrivals.initialBacklog": "Startkø (sager)",
  "arrivals.cases": "Eksplicit ankomstliste",
};
const nodeFields: Record<string, string> = {
  label: "navn",
  kind: "type",
  resourceId: "ressource-id",
  variableCost: "omkostning pr. besøg (kr.)",
  maxVisits: "besøgsloft",
  "duration.type": "varighedsfordeling",
  "duration.value": "fast varighed (ms)",
  "duration.min": "korteste varighed (ms)",
  "duration.mode": "typisk varighed (ms)",
  "duration.max": "længste varighed (ms)",
  "duration.mean": "gennemsnitlig varighed (ms)",
};
export function inputDifferenceLabel(path: string, model: FlowModel) {
  if (labels[path]) return labels[path];
  const resource = /^resources\.(\d+)(?:\.(.+))?$/.exec(path);
  if (resource) {
    const field = resource[2],
      calendar = /^calendar\.(\d+)\.(start|end)$/.exec(field ?? "");
    return `${model.resources[Number(resource[1])]?.label ?? `Ressource #${Number(resource[1]) + 1}`} · ${
      calendar
        ? `arbejdsinterval ${Number(calendar[1]) + 1}, ${calendar[2] === "start" ? "start" : "slut"} (ms)`
        : ({
            capacity: "medarbejdere",
            hourlyCost: "timeløn (kr.)",
            calendar: "arbejdsplan",
            label: "navn",
          }[field] ??
          field ??
          "hele ressourcen")
    }`;
  }
  const node = /^nodes\.(\d+)(?:\.(.+))?$/.exec(path);
  if (node)
    return `${model.nodes[Number(node[1])]?.label ?? `Trin #${Number(node[1]) + 1}`} · ${nodeFields[node[2]] ?? node[2] ?? "hele trinnet"}`;
  const arrival = /^arrivals\.cases\.(\d+)(?:\.(.+))?$/.exec(path);
  if (arrival)
    return `Ankomst #${Number(arrival[1]) + 1} · ${{ id: "sags-id", time: "tidspunkt (ms)", caseType: "sagstype" }[arrival[2]] ?? arrival[2] ?? "hele sagen"}`;
  return path;
}
export function previewInputValue(value: unknown): string {
  if (value === null || value === undefined) return "Ikke angivet";
  if (typeof value === "number")
    return value.toLocaleString("da-DK", { maximumSignificantDigits: 21 });
  if (Array.isArray(value))
    return `Liste med ${value.length.toLocaleString("da-DK")} elementer`;
  if (typeof value === "object")
    return `Objekt med ${Object.keys(value).length.toLocaleString("da-DK")} felter`;
  const text = String(value).replace(
    /[\u0000-\u001f\u007f]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return text.length > 240 ? `${text.slice(0, 237)}…` : text || "Tom tekst";
}
export function differenceRows(
  differences: InputDifference[],
  baseline: FlowModel,
) {
  return differences.map((difference) => ({
    path: difference.path,
    label: inputDifferenceLabel(difference.path, baseline),
    before: previewInputValue(difference.before),
    after: previewInputValue(difference.after),
  }));
}
