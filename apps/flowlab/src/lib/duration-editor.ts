import { distributionSchema, type Distribution } from "@tre/flow-engine";

export const DURATION_UNITS = {
  ms: 1,
  seconds: 1000,
  minutes: 60000,
  hours: 3600000,
} as const;
export const DURATION_UNIT_LABELS = {
  ms: "millisekunder",
  seconds: "sekunder",
  minutes: "minutter",
  hours: "timer",
} as const;
export type DurationUnit = keyof typeof DURATION_UNITS;
export type DurationField = "value" | "mean" | "min" | "mode" | "max";
export interface DurationDraft {
  type: Distribution["type"];
  unit: DurationUnit;
  value: string;
  mean: string;
  min: string;
  mode: string;
  max: string;
}
const MAX_MS = 365 * 24 * 3600000;
function decimalText(value: number) {
  const text = String(value);
  return text.includes("e")
    ? value.toFixed(15).replace(/0+$/, "").replace(/\.$/, "")
    : text;
}
export const DURATION_FIELD_LABELS = {
  value: "Varighed",
  mean: "Gennemsnit",
  min: "Minimum",
  mode: "Typisk",
  max: "Maksimum",
} as const;
export function durationFields(type: Distribution["type"]): DurationField[] {
  return type === "triangular"
    ? ["min", "mode", "max"]
    : type === "fixed"
      ? ["value"]
      : ["mean"];
}
export function expectedDuration(duration: Distribution): number {
  return duration.type === "fixed"
    ? duration.value
    : duration.type === "exponential"
      ? duration.mean
      : (duration.min + duration.mode + duration.max) / 3;
}
export function durationDraft(
  duration: Distribution,
  unit?: DurationUnit,
): DurationDraft {
  const values = durationFields(duration.type).map(
    (field) => (duration as unknown as Record<string, number>)[field],
  );
  unit ??= values.every((value) => value % 60000 === 0)
    ? "minutes"
    : values.every((value) => value % 1000 === 0)
      ? "seconds"
      : "ms";
  const mean = Math.round(expectedDuration(duration));
  const initial = {
    value: mean,
    mean,
    min: Math.max(1, Math.floor(mean / 2)),
    mode: mean,
    max: Math.min(MAX_MS, mean * 2),
  };
  for (const field of durationFields(duration.type))
    initial[field] = (duration as unknown as Record<string, number>)[field];
  return {
    type: duration.type,
    unit,
    ...Object.fromEntries(
      Object.entries(initial).map(([field, value]) => [
        field,
        decimalText(value / DURATION_UNITS[unit]),
      ]),
    ),
  } as DurationDraft;
}
/** Decimal arithmetic avoids binary rounding deciding whether a value exceeds the budget. */
export function parseDurationValue(
  text: string,
  unit: DurationUnit,
  label: string,
) {
  const input = text.trim();
  if (input.length > 100 || !/^\+?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(input))
    throw new Error(
      `${label}: skriv et positivt decimaltal uden tusindtalsseparator. Komma eller punktum kan bruges som decimaltegn.`,
    );
  const [whole, decimals = ""] = input
    .replace("+", "")
    .replace(",", ".")
    .split(".");
  const denominator = 10n ** BigInt(decimals.length);
  const numerator =
    BigInt(`${whole || "0"}${decimals}`) * BigInt(DURATION_UNITS[unit]);
  if (numerator < denominator || numerator > BigInt(MAX_MS) * denominator)
    throw new Error(
      `${label}: varigheden skal være mindst 1 millisekund og højst 365 døgn.`,
    );
  const milliseconds = Number((numerator + denominator / 2n) / denominator);
  return { milliseconds, rounded: numerator % denominator !== 0n };
}
export function parseDurationDraft(draft: DurationDraft): {
  duration: Distribution;
  rounded: string[];
} {
  const fields = durationFields(draft.type),
    rounded: string[] = [];
  const parsed = Object.fromEntries(
    fields.map((field) => {
      const result = parseDurationValue(
        draft[field],
        draft.unit,
        DURATION_FIELD_LABELS[field],
      );
      if (result.rounded) rounded.push(DURATION_FIELD_LABELS[field]);
      return [field, result.milliseconds];
    }),
  );
  if (
    draft.type === "triangular" &&
    !(parsed.min <= parsed.mode && parsed.mode <= parsed.max)
  )
    throw new Error(
      "Trekantfordelingen kræver minimum ≤ typisk ≤ maksimum. Ret felterne samlet, før du anvender ændringen.",
    );
  return {
    duration: distributionSchema.parse({ type: draft.type, ...parsed }),
    rounded,
  };
}
export function changeDurationUnit(
  draft: DurationDraft,
  unit: DurationUnit,
): DurationDraft {
  // Invalid active fields must be corrected before converting their meaning.
  parseDurationDraft(draft);
  const converted = { ...draft, unit };
  for (const field of Object.keys(DURATION_FIELD_LABELS) as DurationField[]) {
    try {
      converted[field] = decimalText(
        parseDurationValue(
          draft[field],
          draft.unit,
          DURATION_FIELD_LABELS[field],
        ).milliseconds / DURATION_UNITS[unit],
      );
    } catch {
      // An unfinished field in an inactive distribution remains unfinished.
      // It will be validated if that distribution is selected again.
    }
  }
  return converted;
}
