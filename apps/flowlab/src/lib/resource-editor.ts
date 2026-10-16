import {
  poolSchema,
  type FlowModel,
  type ResourcePool,
} from "@tre/flow-engine";
export interface ResourceDraft {
  id: string;
  label: string;
  capacity: string;
  hourlyCost: string;
  calendar: { start: string; end: string }[];
}
export function resourceDraft(pool: ResourcePool): ResourceDraft {
  return {
    id: pool.id,
    label: pool.label,
    capacity: String(pool.capacity),
    hourlyCost: String(pool.hourlyCost),
    calendar: pool.calendar.map((interval) => ({
      start: String(interval.start / 60000),
      end: String(interval.end / 60000),
    })),
  };
}
export class ResourceDraftError extends Error {
  constructor(
    public poolId: string,
    message: string,
  ) {
    super(message);
    this.name = "ResourceDraftError";
  }
}
export function parseResourceDraft(draft: ResourceDraft): ResourcePool {
  const fail = (message: string): never => {
    throw new ResourceDraftError(draft.id, message);
  };
  if (!draft.label.trim() || draft.label.length > 100)
    fail("Puljens navn skal have 1–100 tegn.");
  const capacity = Number(draft.capacity),
    hourlyCost = Number(draft.hourlyCost);
  if (
    !draft.capacity.trim() ||
    !Number.isSafeInteger(capacity) ||
    capacity < 0 ||
    capacity > 1000
  )
    fail("Antal medarbejdere skal være et heltal fra 0 til 1.000.");
  if (
    !draft.hourlyCost.trim() ||
    !Number.isFinite(hourlyCost) ||
    hourlyCost < 0 ||
    hourlyCost > 1000000
  )
    fail("Timelønnen skal være mellem 0 og 1.000.000 kr. pr. medarbejder.");
  if (draft.calendar.length > 1000)
    fail("En arbejdsplan må højst have 1.000 intervaller.");
  const calendar = draft.calendar
    .map((interval, index) => {
      const rawStart = Number(interval.start),
        rawEnd = Number(interval.end),
        start = Math.round(rawStart * 60000),
        end = Math.round(rawEnd * 60000);
      if (
        !interval.start.trim() ||
        !interval.end.trim() ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        rawStart < 0 ||
        end <= start ||
        end > 365 * 24 * 3600000
      )
        fail(
          `Arbejdstid ${index + 1}: angiv en ikke-negativ start og en senere slutning, højst 365 døgn fra simulationsstart.`,
        );
      return { start, end };
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);
  if (
    calendar.some(
      (interval, index) =>
        index > 0 && interval.start < calendar[index - 1].end,
    )
  )
    fail(
      "Arbejdstiderne overlapper. Hvert tidspunkt må højst indgå i ét interval.",
    );
  return poolSchema.parse({
    id: draft.id,
    label: draft.label,
    capacity,
    hourlyCost,
    calendar,
  });
}
export function resourceReferences(model: FlowModel, poolId: string) {
  return model.nodes.filter((node) => node.resourceId === poolId);
}
export function removeResourceDraft(
  drafts: ResourceDraft[],
  poolId: string,
  model: FlowModel,
): ResourceDraft[] {
  if (resourceReferences(model, poolId).length)
    throw new ResourceDraftError(
      poolId,
      "Puljen bruges af trin i modellen. Vælg en anden ressource på disse trin, før puljen fjernes.",
    );
  return drafts.filter((draft) => draft.id !== poolId);
}
export function applyResourceDrafts(
  model: FlowModel,
  drafts: ResourceDraft[],
): ResourcePool[] {
  if (drafts.length > 50)
    throw new Error("Modellen må højst have 50 ressourcepuljer.");
  const ids = new Set(drafts.map((draft) => draft.id));
  if (ids.size !== drafts.length)
    throw new Error("Ressourcepuljernes id’er skal være entydige.");
  if (model.nodes.some((node) => node.resourceId && !ids.has(node.resourceId)))
    throw new Error(
      "Et trin henviser til en manglende ressource. Ret tilknytningen, før ressourcerne anvendes.",
    );
  return drafts.map(parseResourceDraft);
}
/** Salary is reserved capacity inside the observation window, independent of actual busy time. */
export function resourcePlan(
  pool: ResourcePool,
  horizon: number,
  observationStart: number,
) {
  const intervals = pool.calendar.length
    ? pool.calendar
    : [{ start: 0, end: horizon }];
  const openTime = intervals.reduce(
      (sum, interval) =>
        sum +
        Math.max(
          0,
          Math.min(interval.end, horizon) -
            Math.max(interval.start, observationStart),
        ),
      0,
    ),
    capacityTime = openTime * pool.capacity;
  return {
    openTime,
    capacityTime,
    salaryCost: (capacityTime / 3600000) * pool.hourlyCost,
  };
}
