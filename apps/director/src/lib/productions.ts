import { libraryThumbnail } from "./library-thumbnail";
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
    const project = parseProject(envelope.data);
    return {
      key,
      title: project.title,
      updatedAt,
      shots: project.sequence.length,
      frames: totalFrames(project),
      // Never retain a full-size source in the summary collection.
      thumbnail: null,
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
/** Each cursor transaction reads one document; decode/release it before requesting the next. */
export async function listProductions(
  signal?: AbortSignal,
): Promise<ProductionSummary[]> {
  // Initialize the shared schema without loading the possibly large first film twice.
  await loadDocument("director", "__library_bootstrap__");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tre-apps-director-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  let previousKey: IDBValidKey | undefined;
  const nextRow = () =>
    new Promise<{ key: IDBValidKey; value: LocalEnvelope<unknown> } | null>(
      (resolve, reject) => {
        if (signal?.aborted)
          return reject(new DOMException("Afbrudt", "AbortError"));
        const tx = db.transaction("documents"),
          request = tx
            .objectStore("documents")
            .openCursor(
              previousKey === undefined
                ? undefined
                : IDBKeyRange.lowerBound(previousKey, true),
            );
        let row: { key: IDBValidKey; value: LocalEnvelope<unknown> } | null =
          null;
        const cancel = () => {
          try {
            tx.abort();
          } catch {
            // The readonly transaction may already have committed.
            reject(new DOMException("Afbrudt", "AbortError"));
          }
        };
        signal?.addEventListener("abort", cancel, { once: true });
        const cleanup = () => signal?.removeEventListener("abort", cancel);
        tx.oncomplete = () => {
          cleanup();
          resolve(row);
        };
        tx.onerror = () => {
          cleanup();
          reject(tx.error);
        };
        tx.onabort = () => {
          cleanup();
          reject(new DOMException("Afbrudt", "AbortError"));
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          row = request.result
            ? { key: request.result.key, value: request.result.value }
            : null;
        };
      },
    );
  const summaries: ProductionSummary[] = [];
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Afbrudt", "AbortError");
      const row = await nextRow();
      if (!row) break;
      previousKey = row.key;
      const key = String(row.key);
      if (!isProductionKey(key)) continue;
      const summary = summarizeProduction(key, row.value);
      if (summary.valid) {
        // summarizeProduction has validated these required fields; the full body is not retained.
        const project = row.value.data as Project,
          shot = project.shots.find((shot) => shot.id === project.sequence[0]),
          media = project.media.find((media) => media.id === shot?.mediaId),
          source =
            media?.kind === "image"
              ? media.dataUrl
              : media
                ? null
                : shot?.frame;
        if (source) summary.thumbnail = await libraryThumbnail(source, signal);
      }
      summaries.push(summary);
    }
    return summaries.sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  } finally {
    db.close();
  }
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
