import { z } from "zod";
import { assertProjectBudget, decodeUtf8 } from "./limits";

export const idSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "Ugyldigt id.");
const text = z.string().max(100_000);
const timestamp = z.string().datetime();
export const briefSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  goal: text,
  audience: text,
  constraints: text,
  acceptance: z.array(z.string().min(1).max(1000)).max(30),
  createdAt: timestamp,
});
export const artifactSchema = z.object({
  id: idSchema,
  artifactId: idSchema,
  version: z.number().int().positive(),
  name: z.string().min(1).max(200),
  mime: z.string().max(100),
  content: z.string().max(14_000_000),
  encoding: z.enum(["utf8", "base64"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative().max(10_000_000),
  kind: z.enum(["code", "design", "document", "evidence", "image", "other"]),
  provenance: z.string().max(1000),
  rights: z.enum(["owned", "licensed", "unknown"]),
  createdAt: timestamp,
});
export const taskSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(300),
  description: text,
  state: z.enum(["ready", "in_progress", "review", "done", "blocked"]),
  briefVersion: z.number().int().positive(),
  acceptance: z.array(z.string().max(1000)).max(30),
  owner: z.string().max(100),
  revision: z.number().int().positive(),
  createdAt: timestamp,
});
export const checkSchema = z.object({
  id: idSchema,
  label: z.string().max(1000),
  passed: z.boolean(),
  source: z.enum(["manual", "sample", "automated"]),
  evidence: z.string().max(2000),
});
export const runSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  briefVersion: z.number().int().positive(),
  inputVersionIds: z.array(idSchema).max(100),
  adapterId: z.literal("manual"),
  idempotencyKey: idSchema,
  state: z.enum([
    "awaiting_upload",
    "review",
    "failed",
    "cancelled",
    "succeeded",
  ]),
  startedAt: timestamp,
  completedAt: timestamp.nullable(),
  costMinor: z.literal(0),
});
export const deliverySchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(300),
  runId: idSchema,
  outputVersionIds: z.array(idSchema).min(1).max(100),
  checks: z.array(checkSchema).max(40),
  summary: text,
  createdAt: timestamp,
});
export const reviewSchema = z.object({
  id: idSchema,
  deliveryId: idSchema,
  decision: z.enum(["accepted", "changes_requested"]),
  reviewer: z.string().min(1).max(100),
  comment: z.string().min(1).max(5000),
  acknowledgedStale: z.boolean(),
  checkedCriteria: z.array(idSchema).max(40),
  createdAt: timestamp,
});
export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  profile: z.literal("web"),
  revision: z.number().int().positive(),
  archivedAt: timestamp.nullable(),
  createdAt: timestamp,
  briefVersions: z.array(briefSchema).min(1).max(1000),
  artifacts: z.array(artifactSchema).max(500),
  tasks: z.array(taskSchema).max(500),
  edges: z.array(z.object({ from: idSchema, to: idSchema })).max(2000),
  runs: z.array(runSchema).max(1000),
  deliveries: z.array(deliverySchema).max(1000),
  reviews: z.array(reviewSchema).max(2000),
  activity: z
    .array(
      z.object({
        id: idSchema,
        type: z.string().max(100),
        title: z.string().max(500),
        createdAt: timestamp,
        revision: z.number().int().positive(),
      }),
    )
    .max(10_000),
});
export const studioSchema = z.object({
  schemaVersion: z.literal(1),
  workspace: z.object({
    id: idSchema,
    name: z.string().min(1).max(100),
    mode: z.literal("MANUAL"),
    budgetLimitMinor: z.literal(0),
  }),
  projects: z.array(projectSchema).max(100),
});
export type Studio = z.infer<typeof studioSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Brief = z.infer<typeof briefSchema>;
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const now = () => new Date().toISOString();

export function assertProject(project: Project): Project {
  const duplicate = (values: string[]) =>
    new Set(values).size !== values.length;
  for (const list of [
    project.briefVersions,
    project.artifacts,
    project.tasks,
    project.runs,
    project.deliveries,
    project.reviews,
    project.activity,
  ])
    if (duplicate(list.map((x) => x.id)))
      throw new Error("Projektet indeholder dublerede id’er.");
  if (duplicate(project.briefVersions.map((x) => String(x.version))))
    throw new Error("Dubleret briefversion.");
  if (duplicate(project.artifacts.map((x) => `${x.artifactId}:${x.version}`)))
    throw new Error("Dubleret filversion.");
  if (duplicate(project.runs.map((x) => x.idempotencyKey)))
    throw new Error("Dubleret run-bestilling.");
  if (duplicate(project.reviews.map((x) => x.deliveryId)))
    throw new Error("En leverance må kun have ét endeligt review.");
  if (duplicate(project.deliveries.map((x) => x.runId)))
    throw new Error("Et run må kun aflevere én uforanderlig leverance.");
  const artifacts = new Set(project.artifacts.map((x) => x.id));
  const tasks = new Set(project.tasks.map((x) => x.id));
  const briefs = new Set(project.briefVersions.map((x) => x.version));
  for (const task of project.tasks)
    if (!briefs.has(task.briefVersion))
      throw new Error("En opgave henviser til et ukendt brief.");
  for (const run of project.runs)
    if (
      !tasks.has(run.taskId) ||
      !briefs.has(run.briefVersion) ||
      run.inputVersionIds.some((x) => !artifacts.has(x))
    )
      throw new Error("Et run har ugyldige inputreferencer.");
  for (const delivery of project.deliveries)
    if (
      !project.runs.some((x) => x.id === delivery.runId) ||
      delivery.outputVersionIds.some((x) => !artifacts.has(x))
    )
      throw new Error("En leverance mangler sit run eller en filversion.");
  for (const delivery of project.deliveries) {
    const run = project.runs.find((r) => r.id === delivery.runId)!;
    const brief = project.briefVersions.find(
      (b) => b.version === run.briefVersion,
    )!;
    if (
      duplicate(delivery.checks.map((c) => c.id)) ||
      brief.acceptance.some(
        (label) => !delivery.checks.some((c) => c.label === label),
      )
    )
      throw new Error("Leverancen mangler acceptkrav fra det låste brief.");
  }
  for (const review of project.reviews) {
    const delivery = project.deliveries.find((x) => x.id === review.deliveryId);
    if (!delivery) throw new Error("Et review mangler sin leverance.");
    if (
      review.decision === "accepted" &&
      delivery.checks.some(
        (check) => !check.passed || !review.checkedCriteria.includes(check.id),
      )
    )
      throw new Error("Et accepteret review mangler godkendte acceptkrav.");
  }
  assertAcyclic(
    project.tasks.map((x) => x.id),
    project.edges,
  );
  return project;
}
export function validateStudio(value: unknown): Studio {
  const state = studioSchema.parse(value);
  if (new Set(state.projects.map((x) => x.id)).size !== state.projects.length)
    throw new Error("Dubleret projekt-id.");
  for (const project of state.projects) assertProject(project);
  return state;
}
export function assertAcyclic(taskIds: string[], edges: Project["edges"]) {
  const tasks = new Set(taskIds);
  const outgoing = new Map(taskIds.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    if (!tasks.has(edge.from) || !tasks.has(edge.to))
      throw new Error("Afhængigheder skal være i samme projekt.");
    outgoing.get(edge.from)!.push(edge.to);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error(
        "Afhængigheden skaber en cirkel. Ingen ændringer er gemt.",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of outgoing.get(id)!) visit(child);
    visiting.delete(id);
    visited.add(id);
  };
  taskIds.forEach(visit);
}
function event(project: Project, type: string, title: string): Project {
  const revision = project.revision + 1;
  return {
    ...project,
    revision,
    activity: [
      ...project.activity,
      { id: uid("event"), type, title, createdAt: now(), revision },
    ],
  };
}
function assertMutable(p: Project) {
  if (p.archivedAt)
    throw new Error(
      "Projektet er arkiveret. Gendan det under Produktioner før nye ændringer.",
    );
}

export function assertProjectUpdate(previous: Project, next: Project): void {
  for (const prior of previous.runs) {
    const retained = next.runs.find((run) => run.id === prior.id);
    if (!retained) throw new Error("Historiske runs kan ikke slettes.");
    const {
      state: _oldState,
      completedAt: _oldCompleted,
      ...oldSnapshot
    } = prior;
    const {
      state: _newState,
      completedAt: _newCompleted,
      ...newSnapshot
    } = retained;
    if (JSON.stringify(oldSnapshot) !== JSON.stringify(newSnapshot))
      throw new Error("Et runs låste input og bestilling kan ikke ændres.");
    if (
      prior.completedAt !== null &&
      retained.completedAt !== prior.completedAt
    )
      throw new Error("Et runs færdigtidspunkt kan ikke ændres.");
    const allowed =
      prior.state === "awaiting_upload"
        ? ["awaiting_upload", "review", "succeeded", "failed", "cancelled"]
        : prior.state === "review"
          ? ["review", "succeeded", "failed"]
          : [prior.state];
    if (!allowed.includes(retained.state))
      throw new Error("Et afsluttet run kan ikke genåbnes eller ændre udfald.");
  }
  if (next.id !== previous.id || next.createdAt !== previous.createdAt)
    throw new Error("Projektets identitet kan ikke ændres.");
  for (const field of [
    "briefVersions",
    "artifacts",
    "deliveries",
    "reviews",
    "activity",
  ] as const) {
    for (const prior of previous[field]) {
      const retained = next[field].find((value) => value.id === prior.id);
      if (!retained || JSON.stringify(retained) !== JSON.stringify(prior))
        throw new Error(
          "Historiske versioner og beviser kan ikke ændres eller slettes.",
        );
    }
  }
}

export function changeProject(
  state: Studio,
  id: string,
  action: (project: Project) => Project,
  expectedRevision?: number,
): Studio {
  if (!state.projects.some((x) => x.id === id))
    throw new Error("Projektet findes ikke.");
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.id === id
        ? (() => {
            if (
              expectedRevision !== undefined &&
              p.revision !== expectedRevision
            )
              throw new Error(
                "Projektet er ændret, siden handlingen begyndte. Prøv igen med den aktuelle version.",
              );
            const next = assertProject(action(structuredClone(p)));
            assertProjectBudget(next);
            assertProjectUpdate(p, next);
            return next;
          })()
        : p,
    ),
  };
}
export function createProject(name: string, description = ""): Project {
  const at = now();
  return projectSchema.parse({
    id: uid("project"),
    name: name.trim(),
    description,
    profile: "web",
    revision: 1,
    archivedAt: null,
    createdAt: at,
    briefVersions: [
      {
        id: uid("brief"),
        version: 1,
        goal: "",
        audience: "",
        constraints: "",
        acceptance: [],
        createdAt: at,
      },
    ],
    artifacts: [],
    tasks: [],
    edges: [],
    runs: [],
    deliveries: [],
    reviews: [],
    activity: [],
  });
}
export function copyProject(source: Project): Project {
  const copy = event(
    {
      ...structuredClone(source),
      id: uid("project"),
      name: `${source.name.slice(0, 88)} (kopi)`,
      createdAt: now(),
      archivedAt: null,
    },
    "project.imported_copy",
    `Importeret kopi af ${source.name} (${source.id})`,
  );
  assertProjectBudget(copy);
  return assertProject(projectSchema.parse(copy));
}
export const latestBrief = (p: Project) =>
  p.briefVersions.reduce((a, b) => (a.version > b.version ? a : b));
export function saveBrief(
  p: Project,
  input: Pick<Brief, "goal" | "audience" | "constraints" | "acceptance">,
) {
  assertMutable(p);
  const brief = briefSchema.parse({
    ...input,
    id: uid("brief"),
    version: latestBrief(p).version + 1,
    createdAt: now(),
  });
  return event(
    { ...p, briefVersions: [...p.briefVersions, brief] },
    "brief.created",
    `Bestilling v${brief.version} gemt`,
  );
}
export function addTask(p: Project, title: string, description = "") {
  assertMutable(p);
  const brief = latestBrief(p);
  const task = taskSchema.parse({
    id: uid("task"),
    title: title.trim(),
    description,
    state: "ready",
    briefVersion: brief.version,
    acceptance: brief.acceptance,
    owner: "Mig",
    revision: 1,
    createdAt: now(),
  });
  return event(
    { ...p, tasks: [...p.tasks, task] },
    "task.created",
    `Opgave oprettet: ${title}`,
  );
}
export function setTaskState(p: Project, id: string, state: Task["state"]) {
  assertMutable(p);
  const task = p.tasks.find((t) => t.id === id);
  if (!task) throw new Error("Opgaven findes ikke.");
  if (
    state === "in_progress" &&
    p.edges.some(
      (edge) =>
        edge.to === id &&
        p.tasks.find((x) => x.id === edge.from)?.state !== "done",
    )
  )
    throw new Error("Afslut først opgavens afhængigheder.");
  if (state === "done")
    throw new Error("En opgave afsluttes gennem en accepteret leverance.");
  return event(
    {
      ...p,
      tasks: p.tasks.map((t) =>
        t.id === id ? { ...t, state, revision: t.revision + 1 } : t,
      ),
    },
    "task.updated",
    `Opgave opdateret: ${task.title}`,
  );
}
export function addDependency(p: Project, from: string, to: string) {
  assertMutable(p);
  if (p.edges.some((e) => e.from === from && e.to === to)) return p;
  const edges = [...p.edges, { from, to }];
  assertAcyclic(
    p.tasks.map((x) => x.id),
    edges,
  );
  return event(
    { ...p, edges },
    "task.dependency_added",
    "Afhængighed tilføjet",
  );
}
export function beginManualRun(p: Project, taskId: string, requestId: string) {
  assertMutable(p);
  const repeated = p.runs.find((r) => r.idempotencyKey === requestId);
  if (repeated) {
    if (repeated.taskId !== taskId)
      throw new Error(
        "Bestillings-id’et er allerede brugt til en anden opgave.",
      );
    return p;
  }
  if (
    p.runs.some(
      (r) =>
        r.taskId === taskId && ["awaiting_upload", "review"].includes(r.state),
    )
  )
    throw new Error(
      "Opgaven har allerede en aktiv levering. Afslut eller annuller den først.",
    );
  const task = p.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("Vælg en opgave.");
  if (task.state === "done")
    throw new Error(
      "En afsluttet opgave kan ikke startes igen. Opret en ny opgave.",
    );
  if (
    p.edges.some(
      (e) =>
        e.to === taskId &&
        p.tasks.find((t) => t.id === e.from)?.state !== "done",
    )
  )
    throw new Error("Afslut først de afhængige opgaver.");
  const brief = latestBrief(p);
  if (!brief.goal.trim() || brief.acceptance.length === 0)
    throw new Error(
      "Beskriv målet og mindst ét acceptkrav, før du starter en levering.",
    );
  const latest = p.artifacts.filter(
    (a) =>
      !p.artifacts.some(
        (b) => b.artifactId === a.artifactId && b.version > a.version,
      ),
  );
  const run = runSchema.parse({
    id: uid("run"),
    taskId,
    briefVersion: brief.version,
    inputVersionIds: latest.map((a) => a.id),
    adapterId: "manual",
    idempotencyKey: requestId,
    state: "awaiting_upload",
    startedAt: now(),
    completedAt: null,
    costMinor: 0,
  });
  return event(
    {
      ...p,
      runs: [...p.runs, run],
      tasks: p.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              state: "in_progress",
              briefVersion: brief.version,
              acceptance: brief.acceptance,
              revision: t.revision + 1,
            }
          : t,
      ),
    },
    "run.started",
    `Manuel levering startet · brief v${brief.version}`,
  );
}
export function addArtifact(p: Project, artifact: Artifact) {
  assertMutable(p);
  if (
    p.artifacts.some(
      (a) =>
        a.id === artifact.id ||
        (a.artifactId === artifact.artifactId &&
          a.version === artifact.version),
    )
  )
    throw new Error("Filversioner kan ikke overskrives.");
  return event(
    { ...p, artifacts: [...p.artifacts, artifactSchema.parse(artifact)] },
    "artifact.created",
    `${artifact.name} · v${artifact.version} tilføjet`,
  );
}
export function submitDelivery(
  p: Project,
  runId: string,
  input: Pick<Delivery, "title" | "summary" | "outputVersionIds" | "checks">,
) {
  assertMutable(p);
  const run = p.runs.find((x) => x.id === runId);
  if (!run || run.state !== "awaiting_upload")
    throw new Error("Dette run kan ikke modtage en ny leverance.");
  const criteria = p.briefVersions.find(
    (b) => b.version === run.briefVersion,
  )!.acceptance;
  if (
    new Set(input.checks.map((c) => c.id)).size !== input.checks.length ||
    criteria.some((label) => !input.checks.some((c) => c.label === label))
  )
    throw new Error(
      "Leverancen skal dokumentere alle acceptkrav fra det låste brief.",
    );
  const delivery = deliverySchema.parse({
    ...input,
    id: uid("delivery"),
    runId,
    createdAt: now(),
  });
  if (
    delivery.outputVersionIds.some(
      (id) => !p.artifacts.some((a) => a.id === id),
    )
  )
    throw new Error("Outputfilen mangler.");
  return event(
    {
      ...p,
      deliveries: [...p.deliveries, delivery],
      runs: p.runs.map((r) =>
        r.id === runId ? { ...r, state: "review", completedAt: now() } : r,
      ),
      tasks: p.tasks.map((t) =>
        t.id === run.taskId
          ? { ...t, state: "review", revision: t.revision + 1 }
          : t,
      ),
    },
    "delivery.ready",
    `${input.title} er klar til review`,
  );
}
export function isStale(p: Project, d: Delivery) {
  const run = p.runs.find((r) => r.id === d.runId);
  if (!run) return true;
  return (
    run.briefVersion !== latestBrief(p).version ||
    run.inputVersionIds.some((id) => {
      const a = p.artifacts.find((x) => x.id === id);
      return (
        a &&
        p.artifacts.some(
          (next) =>
            next.artifactId === a.artifactId &&
            next.version > a.version &&
            !d.outputVersionIds.includes(next.id),
        )
      );
    })
  );
}
export function latestReview(p: Project, deliveryId: string) {
  return p.reviews.filter((r) => r.deliveryId === deliveryId).at(-1);
}
export function reviewDelivery(
  p: Project,
  deliveryId: string,
  input: Omit<Review, "id" | "deliveryId" | "createdAt">,
) {
  assertMutable(p);
  const d = p.deliveries.find((x) => x.id === deliveryId);
  if (!d) throw new Error("Leverancen findes ikke.");
  if (latestReview(p, d.id))
    throw new Error(
      "Denne leverance er allerede vurderet. En rettelse skal være en ny version.",
    );
  const run = p.runs.find((x) => x.id === d.runId)!;
  if (input.reviewer === run.adapterId || input.reviewer === run.id)
    throw new Error("Et run kan ikke acceptere sig selv.");
  if (input.checkedCriteria.some((id) => !d.checks.some((c) => c.id === id)))
    throw new Error("Reviewet henviser til et ukendt acceptkrav.");
  if (input.decision === "accepted") {
    if (d.checks.some((c) => !c.passed))
      throw new Error(
        "Et kontrolpunkt fejlede. Bed om en rettelse før accept.",
      );
    if (d.checks.some((c) => !input.checkedCriteria.includes(c.id)))
      throw new Error("Gennemgå alle acceptkrav før accept.");
    if (isStale(p, d) && !input.acknowledgedStale)
      throw new Error(
        "Leverancen bruger ældre input. Bekræft det eksplicit, eller bed om en rettelse.",
      );
  }
  const review = reviewSchema.parse({
    ...input,
    id: uid("review"),
    deliveryId,
    createdAt: now(),
  });
  let next = {
    ...p,
    reviews: [...p.reviews, review],
    runs: p.runs.map((r) =>
      r.id === run.id
        ? {
            ...r,
            state:
              input.decision === "accepted"
                ? ("succeeded" as const)
                : ("failed" as const),
          }
        : r,
    ),
    tasks: p.tasks.map((t) =>
      t.id === run.taskId
        ? {
            ...t,
            state:
              input.decision === "accepted"
                ? ("done" as const)
                : ("blocked" as const),
            revision: t.revision + 1,
          }
        : t,
    ),
  };
  if (input.decision === "changes_requested")
    next = addTask(next, `Rettelse: ${d.title}`, input.comment);
  return event(
    next,
    `review.${input.decision}`,
    input.decision === "accepted"
      ? `Leverance accepteret: ${d.title}`
      : `Rettelse ønsket: ${d.title}`,
  );
}
export function archiveProject(p: Project) {
  let next = p;
  if (!p.archivedAt) {
    for (const run of p.runs.filter((r) => r.state === "awaiting_upload"))
      next = cancelRun(next, run.id);
  }
  return event(
    { ...next, archivedAt: p.archivedAt ? null : now() },
    p.archivedAt ? "project.restored" : "project.archived",
    p.archivedAt
      ? "Projekt gendannet"
      : "Projekt arkiveret · afventende leveringer annulleret",
  );
}
export function cancelRun(p: Project, runId: string) {
  assertMutable(p);
  const run = p.runs.find((x) => x.id === runId);
  if (!run || run.state !== "awaiting_upload")
    throw new Error("Kun en afventende manuel levering kan annulleres.");
  return event(
    {
      ...p,
      runs: p.runs.map((x) =>
        x.id === runId ? { ...x, state: "cancelled", completedAt: now() } : x,
      ),
      tasks: p.tasks.map((t) =>
        t.id === run.taskId
          ? { ...t, state: "ready", revision: t.revision + 1 }
          : t,
      ),
    },
    "run.cancelled",
    "Manuel levering annulleret",
  );
}
export async function sha256(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function artifactBytes(a: Artifact) {
  return a.encoding === "utf8"
    ? new TextEncoder().encode(a.content)
    : Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
}
export async function textArtifact(
  p: Project,
  name: string,
  content: string,
  kind: Artifact["kind"] = "code",
  artifactId?: string,
): Promise<Artifact> {
  const bytes = new TextEncoder().encode(content);
  content = decodeUtf8(bytes);
  const versions = p.artifacts.filter((x) => x.artifactId === artifactId);
  return artifactSchema.parse({
    id: uid("version"),
    artifactId: artifactId ?? uid("artifact"),
    version: Math.max(0, ...versions.map((x) => x.version)) + 1,
    name,
    content,
    encoding: "utf8",
    sha256: await sha256(bytes),
    bytes: bytes.length,
    mime: name.endsWith(".html") ? "text/html" : "text/plain",
    kind,
    provenance: "Oprettet manuelt i Studio One",
    rights: "owned",
    createdAt: now(),
  });
}
