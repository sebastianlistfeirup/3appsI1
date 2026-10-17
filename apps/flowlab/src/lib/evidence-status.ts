import {
  ENGINE_VERSION,
  type FlowModel,
  type HoldoutAssessment,
} from "@tre/flow-engine";
import { formatNumber, sameModel } from "./document";

export function holdoutPeriod(assessment: HoldoutAssessment): string {
  const { periodStart, periodEnd, unit } = assessment.source;
  if (unit === "iso") {
    const start = new Date(periodStart),
      end = new Date(periodEnd);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()))
      return `${start.toISOString()} – ${end.toISOString()} (UTC)`;
    return `${formatNumber(periodStart)}–${formatNumber(periodEnd)} ms fra Unix-epoken`;
  }
  const scale = unit === "seconds" ? 1000 : 60000;
  const number = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 9 });
  return `${number.format(periodStart / scale)}–${number.format(periodEnd / scale)} ${unit === "seconds" ? "sekunder" : "minutter"}`;
}
/** An assessment covers its frozen baseline. A scenario or a metadata flag is never a calibration proof. */
export function evidenceStatus(
  baseline: FlowModel,
  assessment: HoldoutAssessment | null,
  engineVersion: string = ENGINE_VERSION,
) {
  if (!assessment)
    return {
      code: "unassessed" as const,
      current: false,
      tone: "neutral" as const,
      label: "Baseline er ikke holdout-vurderet",
      reportLabel: "BASELINE · UDEN HOLDOUT-VURDERING",
      footer: "Baseline uden holdout",
      detail:
        "Ingen separat periode er vurderet mod baseline. Importerede data og et ændret modelmærke er ikke i sig selv kalibrering.",
      period: null,
    };
  const current =
    assessment.engineVersion === engineVersion &&
    sameModel(assessment.model, baseline);
  const period = holdoutPeriod(assessment);
  if (!current)
    return {
      code: "historical" as const,
      current,
      tone: "review" as const,
      label: "Baseline har en historisk holdout",
      reportLabel: "BASELINE · HISTORISK HOLDOUT",
      footer: "Baselineholdout er historisk",
      detail:
        "Den gemte vurdering matcher ikke denne baseline og motorversion. Dens tidligere resultat er bevaret; det er ikke en aktuel kvalitetsstatus.",
      period,
    };
  if (assessment.status === "target_met")
    return {
      code: "target_met" as const,
      current,
      tone: "met" as const,
      label: "Baseline når holdout-pilotmålet",
      reportLabel: "BASELINE · HOLDOUT-PILOTMÅL NÅET",
      footer: "Baseline når holdout-pilotmålet",
      detail: `Throughput og median gennemløbstid afviger højst ${formatNumber(assessment.threshold * 100, 1)} % i denne periode. Det gælder baseline; alternativet er ikke særskilt holdout-vurderet.`,
      period,
    };
  const insufficient = assessment.status === "insufficient_data";
  return {
    code: insufficient
      ? ("insufficient_data" as const)
      : ("outside_target" as const),
    current,
    tone: "review" as const,
    label: insufficient
      ? "Baseline mangler tilstrækkelig holdout-data"
      : "Baseline er uden for holdout-pilotmålet",
    reportLabel: insufficient
      ? "BASELINE · UTILSTRÆKKELIG HOLDOUT"
      : "BASELINE · HOLDOUT-PILOTMÅL IKKE NÅET",
    footer: insufficient
      ? "Utilstrækkelig baselineholdout"
      : "Baseline når ikke holdout-pilotmålet",
    detail: insufficient
      ? "Den aktuelle vurdering mangler et tilstrækkeligt datagrundlag. Se de konkrete datamangler, før du bruger modellen som et beslutningsgrundlag."
      : `Den aktuelle baseline opfylder ikke pilotmålet på højst ${formatNumber(assessment.threshold * 100, 1)} % afvigelse på throughput og median gennemløbstid. Undersøg antagelser og datagrundlag.`,
    period,
  };
}
