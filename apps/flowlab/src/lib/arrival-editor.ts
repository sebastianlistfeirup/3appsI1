import { modelSchema, type FlowModel } from "@tre/flow-engine";

export type Arrivals = FlowModel["arrivals"];
export type ManualArrival = Extract<
  Arrivals,
  { type: "explicit" }
>["cases"][number];
export type ArrivalTimeUnit = "minutes" | "seconds" | "ms";
export interface ArrivalDraft {
  id: string;
  time: string;
  unit: ArrivalTimeUnit;
  caseType: string;
}
export const ARRIVAL_UNIT_LABELS: Record<ArrivalTimeUnit, string> = {
  minutes: "minutter",
  seconds: "sekunder",
  ms: "millisekunder",
};
const factors: Record<ArrivalTimeUnit, number> = {
  minutes: 60000,
  seconds: 1000,
  ms: 1,
};
export function emptyArrivalDraft(): ArrivalDraft {
  return { id: "", time: "0", unit: "minutes", caseType: "standard" };
}
export function arrivalDraft(arrival: ManualArrival): ArrivalDraft {
  const unit =
    arrival.time % 60000 === 0
      ? "minutes"
      : arrival.time % 1000 === 0
        ? "seconds"
        : "ms";
  return {
    id: arrival.id,
    time: String(arrival.time / factors[unit]),
    unit,
    caseType: arrival.caseType,
  };
}
export function parseArrivalDraft(draft: ArrivalDraft): ManualArrival {
  for (const [label, value] of [
    ["Sags-id", draft.id],
    ["Sagstype", draft.caseType],
  ]) {
    if (!value.length || value.length > 100)
      throw new Error(`${label} skal have 1–100 tegn.`);
    if (/[\u0000-\u001f\u007f]/.test(value))
      throw new Error(`${label} må ikke indeholde kontroltegn.`);
  }
  const rawTime = Number(draft.time),
    time = Math.round(rawTime * factors[draft.unit]);
  if (
    !draft.time.trim() ||
    !Number.isFinite(rawTime) ||
    rawTime < 0 ||
    !Number.isSafeInteger(time)
  )
    throw new Error(
      "Ankomsttiden skal være et endeligt, ikke-negativt tal inden for millisekundernes heltalsgrænse.",
    );
  return { id: draft.id, time, caseType: draft.caseType };
}
export function putArrival(
  cases: ManualArrival[],
  arrival: ManualArrival,
  previousId?: string,
): ManualArrival[] {
  const index =
    previousId === undefined
      ? -1
      : cases.findIndex((item) => item.id === previousId);
  if (previousId !== undefined && index < 0)
    throw new Error("Sagen findes ikke længere. Vælg den igen fra listen.");
  if (cases.some((item, i) => item.id === arrival.id && i !== index))
    throw new Error("Sags-id findes allerede. Hver sag skal have sit eget id.");
  if (index < 0 && cases.length >= 100000)
    throw new Error(
      "Ankomstlisten må højst indeholde 100.000 sager. Fjern en sag før du tilføjer en ny.",
    );
  const next = [...cases];
  if (index < 0) next.push(arrival);
  else next[index] = arrival;
  return next;
}
export function checkArrivals(value: Arrivals): Arrivals {
  const checked = modelSchema.shape.arrivals.safeParse(value);
  if (!checked.success)
    throw new Error(
      "Kontrollér ankomsternes værdier: højst 100.000 sager, gyldige id’er og ikke-negative heltalstider.",
    );
  const arrivals = checked.data;
  if (
    arrivals.type === "poisson" &&
    arrivals.maxCases + arrivals.initialBacklog > 100000
  )
    throw new Error(
      "Loft for nye sager og startkø må tilsammen højst være 100.000.",
    );
  if (
    arrivals.type === "explicit" &&
    new Set(arrivals.cases.map((arrival) => arrival.id)).size !==
      arrivals.cases.length
  )
    throw new Error("Sags-id findes allerede. Hver sag skal have sit eget id.");
  return arrivals;
}
export function arrivalWindowCounts(
  cases: ManualArrival[],
  horizon: number,
  observationStart: number,
) {
  return cases.reduce(
    (counts, arrival) => {
      if (arrival.time >= horizon) counts.outside++;
      else {
        counts.inPeriod++;
        if (arrival.time < observationStart) counts.beforeMeasurement++;
      }
      return counts;
    },
    { inPeriod: 0, outside: 0, beforeMeasurement: 0 },
  );
}
