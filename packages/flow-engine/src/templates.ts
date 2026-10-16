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

/** Synthetic teaching model: splitting a shared team changes queue competition. */
export function caseRoutingTemplate(): FlowModel {
  const model = goldenModel();
  return {
    ...model,
    id: "case-routing",
    name: "Sagsfordeling",
    description:
      "To sagstyper deler to medarbejdere. Undersøg konsekvensen af at reservere én medarbejder til hver type.",
    horizon: 120 * min,
    sla: 45 * min,
    arrivals: {
      type: "explicit",
      cases: Array.from({ length: 12 }, (_, index) => ({
        id: `sag-${String(index + 1).padStart(2, "0")}`,
        time: index * 5 * min,
        caseType: index % 2 === 0 ? "enkel" : "kompleks",
      })),
    },
    resources: [
      {
        id: "team",
        label: "Fælles team",
        capacity: 2,
        hourlyCost: 285,
        calendar: [],
      },
    ],
    nodes: [
      {
        id: "arrival",
        label: "12 henvendelser",
        kind: "source",
        position: { x: 0, y: 140 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "route",
        label: "Hvilken sagstype?",
        kind: "decision",
        position: { x: 230, y: 140 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "simple",
        label: "Enkel sag · 10 min",
        kind: "activity",
        duration: { type: "fixed", value: 10 * min },
        resourceId: "team",
        position: { x: 470, y: 10 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "complex",
        label: "Kompleks sag · 30 min",
        kind: "activity",
        duration: { type: "fixed", value: 30 * min },
        resourceId: "team",
        position: { x: 470, y: 270 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "done",
        label: "Afsluttet sag",
        kind: "sink",
        position: { x: 740, y: 140 },
        variableCost: 0,
        maxVisits: 20,
      },
    ],
    edges: [
      { id: "arrival-route", source: "arrival", target: "route" },
      {
        id: "route-simple",
        source: "route",
        target: "simple",
        caseType: "enkel",
      },
      {
        id: "route-complex",
        source: "route",
        target: "complex",
        caseType: "kompleks",
      },
      { id: "simple-done", source: "simple", target: "done" },
      { id: "complex-done", source: "complex", target: "done" },
    ],
  };
}

/** Rework is an explicit bounded cycle with waiting that does not occupy staff. */
export function reworkTemplate(): FlowModel {
  const model = membershipTemplate();
  return {
    ...model,
    id: "applications-rework",
    name: "Ansøgninger og genarbejde",
    description:
      "20 syntetiske ansøgninger. Efter behandling kræver 30 % en ny afklaring og et nyt besøg. Andelen er en antagelse, som skal dokumenteres før brug i drift.",
    horizon: 360 * min,
    sla: 90 * min,
    arrivals: {
      type: "explicit",
      cases: Array.from({ length: 20 }, (_, index) => ({
        id: `ansøgning-${String(index + 1).padStart(2, "0")}`,
        time: index * 15 * min,
        caseType: "ansøgning",
      })),
    },
    resources: [
      {
        id: "advisors",
        label: "Sagsbehandlere",
        capacity: 2,
        hourlyCost: 285,
        calendar: [],
      },
    ],
    nodes: [
      {
        id: "arrival",
        label: "Nye ansøgninger",
        kind: "source",
        position: { x: 0, y: 80 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "process",
        label: "Behandl ansøgning",
        kind: "activity",
        duration: {
          type: "triangular",
          min: 8 * min,
          mode: 12 * min,
          max: 20 * min,
        },
        resourceId: "advisors",
        position: { x: 230, y: 80 },
        variableCost: 5,
        maxVisits: 20,
      },
      {
        id: "route",
        label: "Oplysninger på plads?",
        kind: "decision",
        position: { x: 470, y: 80 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "rework",
        label: "Genarbejde · højst 20",
        kind: "rework",
        position: { x: 470, y: 310 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "wait",
        label: "Afventer afklaring",
        kind: "wait",
        duration: { type: "fixed", value: 30 * min },
        position: { x: 230, y: 310 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "done",
        label: "Afsluttet ansøgning",
        kind: "sink",
        position: { x: 740, y: 80 },
        variableCost: 0,
        maxVisits: 20,
      },
    ],
    edges: [
      { id: "arrival-process", source: "arrival", target: "process" },
      { id: "process-route", source: "process", target: "route" },
      { id: "accepted", source: "route", target: "done", weight: 0.7 },
      { id: "needs-rework", source: "route", target: "rework", weight: 0.3 },
      { id: "rework-wait", source: "rework", target: "wait" },
      { id: "wait-process", source: "wait", target: "process" },
    ],
  };
}

/** Equal paid time, different lunch timing; unfinished work resumes after the pause. */
export function calendarTemplate(): FlowModel {
  const model = goldenModel();
  return {
    ...model,
    id: "workday-break",
    name: "Arbejdsdag med pause",
    description:
      "Fire sager med 90 minutters arbejde. En times pause flyttes, mens den samlede bemanding og reserverede løn er den samme.",
    horizon: 480 * min,
    sla: 180 * min,
    arrivals: {
      type: "explicit",
      cases: Array.from({ length: 4 }, (_, index) => ({
        id: `sag-${index + 1}`,
        time: index * 60 * min,
        caseType: "standard",
      })),
    },
    resources: [
      {
        id: "team",
        label: "Faglig sagsbehandler",
        capacity: 1,
        hourlyCost: 285,
        calendar: [
          { start: 0, end: 180 * min },
          { start: 240 * min, end: 480 * min },
        ],
      },
    ],
    nodes: [
      {
        id: "arrival",
        label: "Fire sager",
        kind: "source",
        position: { x: 0, y: 100 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "process",
        label: "Behandling · 90 min",
        kind: "activity",
        duration: { type: "fixed", value: 90 * min },
        resourceId: "team",
        position: { x: 260, y: 100 },
        variableCost: 0,
        maxVisits: 20,
      },
      {
        id: "done",
        label: "Afsluttet sag",
        kind: "sink",
        position: { x: 520, y: 100 },
        variableCost: 0,
        maxVisits: 20,
      },
    ],
    edges: [
      { id: "arrival-process", source: "arrival", target: "process" },
      { id: "process-done", source: "process", target: "done" },
    ],
  };
}
