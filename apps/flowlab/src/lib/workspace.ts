import { CSV_FIELDS, createCsvImporter } from "@tre/flow-engine";
import {
  validateDocument,
  type FlowDocument,
  type ModelSnapshot,
} from "./document";
export const MAX_WORKSPACE_BYTES = 128 * 1024 * 1024;
export const MAX_VERSION_BYTES = 16 * 1024 * 1024;
/** Simulation details belong in a report export. A workspace restores inputs and recalculates them. */
export function workspaceCopy(doc: FlowDocument): FlowDocument {
  return { ...doc, comparison: null };
}
export function serializeWorkspace(doc: FlowDocument): string {
  return JSON.stringify(workspaceCopy(doc));
}
export function importWorkspace(text: string): FlowDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BYTES)
    throw new Error("Modelpakken må højst være 128 MB.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Modelpakken skal indeholde et FlowLab-arbejdsrum.");
  // Imported results are never evidence. Validate and recompute input, including old-format exports.
  const doc = validateDocument({ ...value, comparison: null, holdout: null });
  if (doc.dataset) {
    const { result, unit } = doc.dataset;
    if (
      result.rowCount !== result.rows.length + result.excludedRows ||
      result.issueCount < result.excludedRows
    )
      throw new Error(
        "Datagrundlagets rækketal stemmer ikke overens. Importér den oprindelige CSV igen.",
      );
    const allowed = new Set<string>(CSV_FIELDS);
    const fields = new Set(result.rows.flatMap((row) => Object.keys(row)));
    if ([...fields].some((field) => !allowed.has(field)))
      throw new Error(
        "Datagrundlaget indeholder ukendte felter. Importér den oprindelige CSV og vælg de nødvendige kolonner.",
      );
    const headers = CSV_FIELDS.filter((field) => fields.has(field));
    if (!headers.length)
      throw new Error("Datagrundlaget indeholder ingen gyldige kolonner.");
    const importer = createCsvImporter({ unit });
    importer.write(headers.join(",") + "\n");
    for (const row of result.rows)
      importer.write(
        headers
          .map((field) => `"${(row[field] ?? "").replaceAll('"', '""')}"`)
          .join(",") + "\n",
      );
    const checked = importer.finish();
    if (checked.excludedRows)
      throw new Error(
        `Modelpakkens datagrundlag indeholder ${checked.excludedRows} ugyldige rækker. Importér den oprindelige CSV igen for et konkret kvalitetstjek.`,
      );
    // Derived duration/period summaries are recalculated from the preserved rows and explicit unit.
    doc.dataset.result = {
      ...result,
      rows: checked.rows,
      durationMs: checked.durationMs,
      observedStart: checked.observedStart,
      observedEnd: checked.observedEnd,
      warnings: [...new Set([...result.warnings, ...checked.warnings])],
    };
  }
  return doc;
}
export function versionBytes(versions: ModelSnapshot[]): number {
  return new TextEncoder().encode(JSON.stringify(versions)).byteLength;
}
export function appendVersion(
  doc: FlowDocument,
  id: string,
  savedAt: string,
): { snapshot: ModelSnapshot; versions: ModelSnapshot[] } {
  const sequence =
    Math.max(
      0,
      ...doc.versions.map((version) =>
        Number(/^Version (\d+)$/.exec(version.label)?.[1] ?? 0),
      ),
    ) + 1;
  const snapshot: ModelSnapshot = {
    id,
    label: `Version ${sequence}`,
    savedAt,
    baseline: structuredClone(doc.baseline),
    scenario: structuredClone(doc.scenario),
  };
  const versions = [snapshot, ...doc.versions].slice(0, 30);
  if (versionBytes(versions) > MAX_VERSION_BYTES)
    throw new Error(
      "Versionslageret har en grænse på 16 MB. Eksportér arbejdsrummet, og fjern et tidligere snapshot, før du gemmer et nyt. Dine modeller er bevaret.",
    );
  return { snapshot, versions };
}
export function workspaceError(error: unknown): string {
  if (error instanceof SyntaxError)
    return "Filen indeholder ikke gyldig JSON. Vælg en eksporteret FlowLab-modelpakke.";
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    const issues = error.issues as { path?: unknown[]; message?: string }[];
    return `Modelpakkens indhold er ugyldigt ved ${issues
      .slice(0, 3)
      .map((issue) => issue.path?.join(".") || "arbejdsrum")
      .join(
        ", ",
      )}. Kontrollér filens format og grænser; dit nuværende arbejde er bevaret.`;
  }
  return error instanceof Error
    ? error.message
    : "Modelpakken kunne ikke læses.";
}
