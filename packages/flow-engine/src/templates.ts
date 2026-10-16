import type { FlowModel } from "./model";
const min = 60_000;
export function membershipTemplate(): FlowModel {
  return {
    schemaVersion: 1,
    id: "membership-service",
    revision: 1,
    name: "Medlemsservice",
    description:
      "Hvad sker der med restkøen, hvis vi tilføjer én medarbejder i sagsbehandlingen?",
    evidence: "synthetic",
    horizon: 8 * 60 * min,
    observationStart: 0,
    maxEvents: 100000,
    sla: 120 * min,
    fixedAutomationCost: 0,
    arrivals: {
      type: "poisson",
      meanInterval: 4.8 * min,
      maxCases: 250,
      initialBacklog: 0,
    },
    resources: [
      {
        id: "advisors",
        label: "Sagsbehandlere",
        capacity: 3,
        hourlyCost: 285,
        calendar: [],
      },
      {
        id: "quality",
        label: "Kvalitetsteam",
        capacity: 1,
        hourlyCost: 310,
        calendar: [],
      },
    ],
    nodes: [
      {
        id: "arrival",
        label: "Nye henvendelser",
        kind: "source",
        position: { x: 0, y: 145 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "process",
        label: "Sagsbehandling",
        kind: "activity",
        position: { x: 230, y: 145 },
        duration: {
          type: "triangular",
          min: 8 * min,
          mode: 16 * min,
          max: 30 * min,
        },
        resourceId: "advisors",
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "route",
        label: "Kvalitetstjek?",
        kind: "decision",
        position: { x: 460, y: 145 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "check",
        label: "Kvalitetskontrol",
        kind: "activity",
        position: { x: 460, y: -80 },
        duration: {
          type: "triangular",
          min: 3 * min,
          mode: 5 * min,
          max: 10 * min,
        },
        resourceId: "quality",
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "done",
        label: "Afsluttet sag",
        kind: "sink",
        position: { x: 700, y: 145 },
        variableCost: 0,
        maxVisits: 20,
      },
    ],
    edges: [
      { id: "e1", source: "arrival", target: "process" },
      { id: "e2", source: "process", target: "route" },
      { id: "e3", source: "route", target: "check", weight: 0.3 },
      { id: "e4", source: "route", target: "done", weight: 0.7 },
      { id: "e5", source: "check", target: "done" },
    ],
  };
}
export function goldenModel(): FlowModel {
  return {
    schemaVersion: 1,
    id: "golden",
    revision: 1,
    name: "FL-AT01",
    description: "Tre sager, ét sikkert facit.",
    evidence: "synthetic",
    horizon: 300000,
    observationStart: 0,
    maxEvents: 10000,
    sla: 120000,
    fixedAutomationCost: 0,
    arrivals: {
      type: "explicit",
      cases: [
        { id: "a", time: 0, caseType: "standard" },
        { id: "b", time: 60000, caseType: "standard" },
        { id: "c", time: 120000, caseType: "standard" },
      ],
    },
    resources: [
      {
        id: "r",
        label: "Ressource",
        capacity: 1,
        hourlyCost: 100,
        calendar: [],
      },
    ],
    nodes: [
      {
        id: "s",
        label: "Ankomst",
        kind: "source",
        position: { x: 0, y: 0 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "a",
        label: "Aktivitet",
        kind: "activity",
        position: { x: 200, y: 0 },
        duration: { type: "fixed", value: 90000 },
        resourceId: "r",
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "e",
        label: "Slut",
        kind: "sink",
        position: { x: 400, y: 0 },
        variableCost: 0,
        maxVisits: 20,
      },
    ],
    edges: [
      { id: "sa", source: "s", target: "a" },
      { id: "ae", source: "a", target: "e" },
    ],
  };
}
