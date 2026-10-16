import {
  experimentContext,
  sameModel,
  type FlowDocument,
  type ModelSnapshot,
} from "./document";
import { appendVersion, restoreVersion } from "./workspace";
export function snapshotMatchesDraft(
  snapshot: ModelSnapshot,
  doc: FlowDocument,
): boolean {
  const context = experimentContext(doc);
  return (
    !!snapshot.context &&
    snapshot.context.scenarioName === context.scenarioName &&
    snapshot.context.hypothesis === context.hypothesis &&
    snapshot.context.baseSeed === context.baseSeed &&
    sameModel(snapshot.baseline, doc.baseline) &&
    sameModel(snapshot.scenario, doc.scenario)
  );
}
/** A safety copy must never silently remove an existing saved version. */
export function preserveDraft(
  doc: FlowDocument,
  id: string,
  savedAt: string,
): { document: FlowDocument; archived: ModelSnapshot | null } {
  if (doc.versions.some((snapshot) => snapshotMatchesDraft(snapshot, doc)))
    return { document: doc, archived: null };
  if (doc.versions.length >= 30)
    throw new Error(
      "Alle 30 versionspladser er i brug. Eksportér arbejdsrummet, og fjern et gemt snapshot i Modelbibliotek, før du skifter scenarie. Dit aktuelle udkast er bevaret.",
    );
  const result = appendVersion(doc, id, savedAt);
  return {
    document: { ...doc, versions: result.versions },
    archived: result.snapshot,
  };
}
export function openSavedScenario(
  doc: FlowDocument,
  versionId: string,
  safetyId: string,
  savedAt: string,
) {
  const target = doc.versions.find((snapshot) => snapshot.id === versionId);
  if (!target)
    throw new Error(
      "Det gemte scenarie findes ikke længere. Dit udkast er bevaret.",
    );
  const safe = preserveDraft(doc, safetyId, savedAt);
  return {
    document: restoreVersion(safe.document, target),
    archived: safe.archived,
  };
}
export function openTemplateInWorkspace(
  doc: FlowDocument,
  template: FlowDocument,
  safetyId: string,
  savedAt: string,
) {
  const safe = preserveDraft(doc, safetyId, savedAt);
  return {
    document: {
      ...safe.document,
      baseline: structuredClone(template.baseline),
      scenario: structuredClone(template.scenario),
      scenarioName: template.scenarioName,
      hypothesis: template.hypothesis,
      comparison: null,
      comparisonContext: null,
    },
    archived: safe.archived,
  };
}
export function alternativeFromBaseline(
  doc: FlowDocument,
  safetyId: string,
  savedAt: string,
) {
  const safe = preserveDraft(doc, safetyId, savedAt);
  return {
    document: {
      ...safe.document,
      scenario: structuredClone(doc.baseline),
      scenarioName: "Nyt alternativ",
      hypothesis: "",
    },
    archived: safe.archived,
  };
}
