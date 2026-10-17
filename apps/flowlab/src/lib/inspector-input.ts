import type { FlowModel } from "@tre/flow-engine";
import {
  durationDraft,
  parseDurationValue,
  type DurationUnit,
} from "./duration-editor";

export function inputDecimal(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  const [mantissa, exponent] = text.split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const unsigned = mantissa.replace("-", "");
  const digits = unsigned.replace(".", "");
  const position =
    (unsigned.indexOf(".") === -1 ? unsigned.length : unsigned.indexOf(".")) +
    Number(exponent);
  return (
    sign +
    (position <= 0
      ? `0.${"0".repeat(-position)}${digits}`
      : position >= digits.length
        ? `${digits}${"0".repeat(position - digits.length)}`
        : `${digits.slice(0, position)}.${digits.slice(position)}`)
  );
}
export function inputTime(milliseconds: number, unit: DurationUnit) {
  return durationDraft({ type: "fixed", value: milliseconds }, unit).value;
}
export function inputNumber(
  text: string,
  min: number,
  max: number,
  integer = false,
): number {
  const clean = text.trim();
  if (
    !clean ||
    clean.length > 100 ||
    !/^\+?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(clean)
  )
    throw new Error(
      "Skriv et tal uden tusindtalsseparator. Komma eller punktum kan bruges som decimaltegn.",
    );
  const value = Number(clean.replace(",", "."));
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `Angiv ${integer ? "et heltal" : "et tal"} fra ${min.toLocaleString("da-DK")} til ${max.toLocaleString("da-DK")}.`,
    );
  return value;
}
export function inputLabel(text: string): string {
  if (!text.trim() || text.length > 100 || /[\u0000-\u001f\u007f]/.test(text))
    throw new Error(
      "Skriv 1–100 tegn uden kontroltegn; navnet må ikke være tomt.",
    );
  return text;
}
export function inputHorizon(text: string, observationStart: number) {
  const value = parseDurationValue(
    text,
    "hours",
    "Simulationshorisont",
  ).milliseconds;
  if (value <= observationStart)
    throw new Error(
      "Simulationsstop skal ligge efter målestart. Ret eventuelt begge under Scenarier.",
    );
  return value;
}
export function inputArrivalLimit(
  text: string,
  model: FlowModel,
  field: "maxCases" | "initialBacklog",
) {
  const value = inputNumber(
    text,
    field === "maxCases" ? 1 : 0,
    field === "maxCases" ? 100000 : 10000,
    true,
  );
  if (model.arrivals.type !== "poisson")
    throw new Error("Modellen bruger ikke Poisson-ankomster.");
  const other =
    model.arrivals[field === "maxCases" ? "initialBacklog" : "maxCases"];
  if (value + other > 100000)
    throw new Error(
      "Loft for nye sager og startkø må tilsammen højst være 100.000.",
    );
  return value;
}
export function inputExpectedArrivals(text: string, horizon: number) {
  const count = inputNumber(text, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER);
  const meanInterval = Math.round(horizon / count);
  if (
    !Number.isSafeInteger(meanInterval) ||
    meanInterval < 1 ||
    meanInterval > 31536000000
  )
    throw new Error(
      "Antallet skal svare til et gennemsnitligt interval mellem 1 ms og 365 døgn. Brug ankomsteditoren til at angive intervallet direkte.",
    );
  return meanInterval;
}
