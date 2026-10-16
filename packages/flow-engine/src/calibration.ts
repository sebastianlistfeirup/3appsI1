import { ENGINE_VERSION, parseModel, type FlowModel } from "./model";
import { percentile, type SimulationResult } from "./engine";
import { parseTimestamp, type CsvImport } from "./csv";
export interface HoldoutMetric {
  observed: number | null;
  simulated: number | null;
  relativeError: number | null;
  withinTarget: boolean | null;
  sampleCount: number;
}
export interface HoldoutAssessment {
  schemaVersion: 1;
  engineVersion: string;
  assessedAt: string;
  status: "target_met" | "outside_target" | "insufficient_data";
  threshold: number;
  model: FlowModel;
  seeds: number[];
  source: {
    id?: string;
    name: string;
    sha256: string;
    unit: "iso" | "seconds" | "minutes";
    rows: number;
    excludedRows: number;
    periodStart: number;
    periodEnd: number;
    completionActivity: string;
  };
  independent: boolean;
  completeWindow: boolean;
  metrics: {
    throughput: HoldoutMetric;
    leadTime: HoldoutMetric;
    backlog: HoldoutMetric;
    queueTime: HoldoutMetric;
  };
  dataGaps: string[];
  notes: string[];
}
const mean = (values: (number | null)[]) => {
  const valid = values.filter(
    (n): n is number => n !== null && Number.isFinite(n),
  );
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};
const measurement = (
  observed: number | null,
  simulated: number | null,
  sampleCount: number,
  threshold: number,
): HoldoutMetric => {
  const relativeError =
    observed === null || simulated === null
      ? null
      : observed === 0
        ? simulated === 0
          ? 0
          : null
        : Math.abs(simulated - observed) / Math.abs(observed);
  return {
    observed,
    simulated,
    relativeError,
    withinTarget: relativeError === null ? null : relativeError <= threshold,
    sampleCount,
  };
};
/** A holdout checks a frozen baseline against an explicitly complete, independent period. It never tunes the model. */
export function assessHoldout(input: {
  model: FlowModel;
  runs: SimulationResult[];
  dataset: CsvImport;
  sourceName: string;
  sourceId?: string;
  sourceHash: string;
  unit: "iso" | "seconds" | "minutes";
  periodStart: number;
  periodEnd: number;
  completionActivity: string;
  independent: boolean;
  completeWindow: boolean;
  trainingDataHashes?: string[];
  threshold?: number;
  assessedAt?: string;
}): HoldoutAssessment {
  const model = parseModel(input.model),
    threshold = input.threshold ?? 0.15;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Pilotmålet skal ligge mellem 0 og 100 %.");
  if (
    !Number.isSafeInteger(input.periodStart) ||
    !Number.isSafeInteger(input.periodEnd) ||
    input.periodEnd <= input.periodStart
  )
    throw new Error(
      "Holdout-perioden kræver en gyldig start og en senere slutning.",
    );
  if (
    input.periodEnd - input.periodStart !==
    model.horizon - model.observationStart
  )
    throw new Error(
      "Holdout-perioden skal have præcis samme varighed som modellens målevindue.",
    );
  if (!/^[a-f0-9]{64}$/.test(input.sourceHash))
    throw new Error(
      "Datagrundlagets SHA-256 mangler. Gem den validerede import først.",
    );
  if (!input.completionActivity.trim())
    throw new Error("Vælg den aktivitet, som dokumenterer sagens afslutning.");
  if (
    !input.dataset.rows.some((row) => row.activity === input.completionActivity)
  )
    throw new Error(
      "Den afsluttende aktivitet findes ikke i datagrundlaget. Vælg dens præcise navn.",
    );
  const runs = input.runs;
  if (
    runs.length < 30 ||
    new Set(runs.map((r) => r.seed)).size !== runs.length ||
    runs.some(
      (r) =>
        r.status !== "completed" ||
        r.engineVersion !== ENGINE_VERSION ||
        r.modelId !== model.id ||
        r.modelRevision !== model.revision ||
        r.horizon !== model.horizon ||
        r.observationStart !== model.observationStart,
    )
  )
    throw new Error(
      "Kør mindst 30 komplette, forskellige seeds på den aktuelle baseline først.",
    );
  const gaps = new Set<string>(),
    notes: string[] = [];
  if (!input.independent)
    gaps.add(
      "Holdout-perioden er ikke bekræftet uafhængig af de data, modellen blev tilpasset med.",
    );
  if (input.trainingDataHashes?.includes(input.sourceHash))
    gaps.add(
      "Den samme kildefil er allerede brugt til at ændre en modelantagelse. Brug et separat holdout-datasæt.",
    );
  if (!input.completeWindow)
    gaps.add(
      "Det er ikke bekræftet, at alle ankomster, aktivitetsbesøg og afslutninger i perioden er med.",
    );
  if (input.dataset.excludedRows)
    gaps.add(
      `${input.dataset.excludedRows} rækker er udeladt. Det kan ændre throughput, kø og gennemløbstid.`,
    );
  const grouped = new Map<
    string,
    {
      arrival: number | null;
      events: { activity: string; start: number | null; end: number | null }[];
    }
  >();
  for (const row of input.dataset.rows) {
    const id = row.case_id;
    if (!id) {
      gaps.add("En gyldig række mangler sags-id.");
      continue;
    }
    const c = grouped.get(id) ?? { arrival: null, events: [] };
    const arrival = parseTimestamp(row.arrived_at ?? "", input.unit),
      start = parseTimestamp(row.started_at ?? "", input.unit),
      end = parseTimestamp(row.finished_at ?? "", input.unit);
    if ([arrival, start, end].some((t) => t !== null && !Number.isFinite(t))) {
      gaps.add("Datagrundlaget indeholder en ugyldig tidsværdi.");
      continue;
    }
    if (arrival !== null) {
      if (c.arrival !== null && c.arrival !== arrival)
        gaps.add("Samme sag har forskellige ankomsttidspunkter.");
      c.arrival = Math.min(c.arrival ?? arrival, arrival);
    }
    c.events.push({ activity: row.activity ?? "", start, end });
    grouped.set(id, c);
  }
  const leads: number[] = [],
    queues: number[] = [],
    activityNames = new Set(
      model.nodes
        .filter((n) => n.kind === "activity")
        .flatMap((n) => [n.id, n.label]),
    );
  let throughput = 0,
    backlog = 0,
    missingArrivals = 0,
    unusableQueueCases = 0;
  const queueComparable = !model.nodes.some((n) => n.kind === "wait");
  if (!queueComparable)
    notes.push(
      "Ventetid kan ikke adskilles fra planlagt vent i dette CSV-format; køsammenligningen er derfor ikke tilgængelig.",
    );
  for (const c of grouped.values()) {
    const completions = c.events
      .filter((e) => e.activity === input.completionActivity && e.end !== null)
      .map((e) => e.end!);
    if (completions.length > 1)
      gaps.add(
        "Mindst én sag har flere afsluttende hændelser. Afklar hvilken der er sagens afslutning.",
      );
    const finish = completions.length ? Math.max(...completions) : null;
    if (c.arrival === null) missingArrivals++;
    if (c.arrival !== null && finish !== null && finish < c.arrival)
      gaps.add("Mindst én sag er afsluttet før sin ankomst.");
    if (
      c.arrival !== null &&
      c.arrival < input.periodEnd &&
      (finish === null || finish > input.periodEnd)
    )
      backlog++;
    if (
      finish === null ||
      finish < input.periodStart ||
      finish > input.periodEnd
    )
      continue;
    throughput++;
    if (c.arrival === null || finish < c.arrival) continue;
    leads.push(finish - c.arrival);
    if (!queueComparable) continue;
    // Complete activity logs let us sum queue intervals; activity elapsed time includes any calendar pause.
    const events = c.events
      .filter(
        (e) =>
          e.activity !== input.completionActivity ||
          activityNames.has(e.activity),
      )
      .filter((e) => e.start !== null || e.end !== null)
      .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
    let cursor = c.arrival,
      queue = 0,
      valid = events.length > 0;
    for (const e of events) {
      if (
        !activityNames.has(e.activity) ||
        e.start === null ||
        e.end === null ||
        e.start < cursor ||
        e.end < e.start ||
        e.end > finish
      ) {
        valid = false;
        break;
      }
      queue += e.start - cursor;
      cursor = e.end;
    }
    if (cursor !== finish) valid = false;
    if (valid) queues.push(queue);
    else unusableQueueCases++;
  }
  if (!grouped.size) gaps.add("Datasættet indeholder ingen gyldige sager.");
  if (missingArrivals)
    gaps.add(
      `${missingArrivals} sager mangler ankomsttid. Restkø og gennemløbstid kan ikke vurderes fuldt.`,
    );
  if (!throughput)
    gaps.add(
      "Ingen dokumenterede afslutninger i holdout-perioden. Median gennemløbstid kan ikke vurderes.",
    );
  if (leads.length !== throughput)
    gaps.add("Ikke alle afsluttede sager har en kendt, gyldig ankomst.");
  if (unusableQueueCases)
    notes.push(
      `${unusableQueueCases} afsluttede sager har ikke et komplet, entydigt aktivitetsforløb, som matcher modellens aktivitetsnavne. Ventetid vises ikke for et ufuldstændigt udsnit.`,
    );
  const metrics = {
    throughput: measurement(
      throughput,
      mean(runs.map((r) => r.metrics.throughput)),
      throughput,
      threshold,
    ),
    leadTime: measurement(
      percentile(leads, 0.5),
      mean(runs.map((r) => r.metrics.leadTime.median)),
      leads.length,
      threshold,
    ),
    backlog: measurement(
      missingArrivals ? null : backlog,
      mean(runs.map((r) => r.metrics.backlog)),
      grouped.size,
      threshold,
    ),
    queueTime: measurement(
      queueComparable && !unusableQueueCases && queues.length === throughput
        ? mean(queues)
        : null,
      mean(runs.map((r) => r.metrics.queueTime.mean)),
      queues.length,
      threshold,
    ),
  };
  const status = gaps.size
    ? "insufficient_data"
    : metrics.throughput.withinTarget === true &&
        metrics.leadTime.withinTarget === true
      ? "target_met"
      : "outside_target";
  if (leads.length > 0 && leads.length < 30)
    notes.push(
      "Kun " +
        leads.length +
        " afsluttede sager har kendt ankomst. Det er et lille holdout-grundlag; vurder også andre perioder og proceskendskab.",
    );
  notes.push(
    "15 %-grænsen er et pilotmål for throughput og median gennemløbstid, ikke en generel faglig sandhed eller en garanti for fremtidig drift.",
  );
  notes.push(
    "Simuleret gennemløbstid er middelværdien af de enkelte kørselsmedianer. Backlog og ventetid vises som supplerende diagnostik.",
  );
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    assessedAt: input.assessedAt ?? new Date().toISOString(),
    status,
    threshold,
    model: structuredClone(model),
    seeds: runs.map((r) => r.seed),
    source: {
      ...(input.sourceId ? { id: input.sourceId } : {}),
      name: input.sourceName,
      sha256: input.sourceHash,
      unit: input.unit,
      rows: input.dataset.rows.length,
      excludedRows: input.dataset.excludedRows,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      completionActivity: input.completionActivity,
    },
    independent: input.independent,
    completeWindow: input.completeWindow,
    metrics,
    dataGaps: [...gaps],
    notes,
  };
}
