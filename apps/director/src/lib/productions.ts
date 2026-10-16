import {
  createSampleProject,
  createEnvironment,
  parseProject,
  totalFrames,
  type Project,
} from "@tre/scene-format";
import {
  loadDocument,
  saveDocument,
  type LocalEnvelope,
} from "@tre/persistence";
export const isProductionKey = (key: string) =>
  /^production(?:_[a-f0-9]{32})?$/.test(key);
export interface ProductionSummary {
  key: string;
  title: string;
  updatedAt: string | null;
  shots: number;
  frames: number;
  thumbnail: string | null;
  valid: boolean;
  error?: string;
}
export function summarizeProduction(
  key: string,
  envelope: LocalEnvelope<unknown>,
): ProductionSummary {
  const updatedAt = Number.isFinite(Date.parse(envelope?.updatedAt))
    ? envelope?.updatedAt
    : null;
  try {
    if (envelope?.schemaVersion !== 1)
      throw Error("Lagringsversionen understøttes ikke");
    const project = parseProject(envelope.data),
      shot = project.shots.find((s) => s.id === project.sequence[0]),
      media = project.media.find((m) => m.id === shot?.mediaId);
    return {
      key,
      title: project.title,
      updatedAt,
      shots: project.sequence.length,
      frames: totalFrames(project),
      thumbnail:
        media?.kind === "image"
          ? media.dataUrl
          : media?.kind === "video"
            ? null
            : (shot?.frame ?? null),
      valid: true,
    };
  } catch (error) {
    const data = envelope?.data as { title?: unknown } | null;
    return {
      key,
      title:
        typeof data?.title === "string"
          ? data.title.slice(0, 120)
          : "Produktion kan ikke åbnes",
      updatedAt,
      shots: 0,
      frames: 0,
      thumbnail: null,
      valid: false,
      error: error instanceof Error ? error.message : "Ukendt projektformat",
    };
  }
}
/** Scan actual documents with a cursor; no separately maintained index or duplicate project bodies. */
export async function listProductions(): Promise<ProductionSummary[]> {
  await loadDocument("director", "production");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tre-apps-director-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction("documents"),
        cursor = tx.objectStore("documents").openCursor(),
        list: ProductionSummary[] = [];
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const key = String(row.key);
        if (isProductionKey(key))
          list.push(summarizeProduction(key, row.value));
        row.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve(
          list.sort((a, b) =>
            (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
          ),
        );
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export function freshProduction(
  title: string,
  template: "empty" | "sample",
  source?: Project,
): Project {
  const project = source ? structuredClone(source) : createSampleProject();
  project.id = "film_" + crypto.randomUUID().replaceAll("-", "");
  project.title = title.trim().slice(0, 120) || "Min nye film";
  project.revision = 0;
  if (!source && template === "empty") {
    project.brief = "";
    project.draft.name = "Mit første set";
    project.draft.environment = createEnvironment("studio");
    project.draft.objects = [];
    project.draft.cameras = project.draft.cameras.map((camera, index) => ({
      ...camera,
      name: `Kamera ${String(index + 1).padStart(2, "0")}`,
    }));
    project.draft.assets = [];
    project.draft.version = 1;
    project.draft.id = "scene_" + crypto.randomUUID().replaceAll("-", "");
    project.scenes = [structuredClone(project.draft)];
    project.shots = [];
    project.sequence = [];
    project.media = [];
    project.voice = null;
    project.music = null;
  }
  return parseProject(project);
}
export async function createProduction(
  title: string,
  template: "empty" | "sample",
  source?: Project,
) {
  const key = "production_" + crypto.randomUUID().replaceAll("-", ""),
    project = freshProduction(title, template, source);
  await saveDocument("director", key, project, 0);
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("tre-apps-director");
    channel.postMessage({ key, revision: 1 });
    channel.close();
  }
  return { key, project };
}
