import type { Dataset, FlowDocument } from "./document";
export const MAX_DATASET_BYTES = 32 * 1024 * 1024;
export const MAX_DATASETS = 4;
export function datasetBytes(datasets: Dataset[]): number {
  return new TextEncoder().encode(JSON.stringify(datasets)).byteLength;
}
export function planDatasetChange(
  doc: Pick<FlowDocument, "dataset" | "datasetHistory">,
  next: Dataset,
) {
  const existing = [doc.dataset, ...doc.datasetHistory].filter(
    (dataset): dataset is Dataset => !!dataset && dataset.id !== next.id,
  );
  const kept = [next, ...existing],
    removed: Dataset[] = [];
  while (kept.length > MAX_DATASETS) removed.push(kept.pop()!);
  let bytes = datasetBytes(kept);
  while (bytes > MAX_DATASET_BYTES && kept.length > 1) {
    removed.push(kept.pop()!);
    bytes = datasetBytes(kept);
  }
  if (bytes > MAX_DATASET_BYTES)
    throw new Error(
      "Det rensede datagrundlag overstiger det lokale datalagers grænse på 32 MB. Brug en mindre CSV-fil.",
    );
  return {
    dataset: next,
    history: kept.slice(1),
    removed,
    bytes,
  };
}
export function replaceDataset(
  doc: FlowDocument,
  next: Dataset,
  allowRemoval = false,
): FlowDocument {
  const plan = planDatasetChange(doc, next);
  if (plan.removed.length && !allowRemoval)
    throw new Error(
      "Datalageret er fyldt. Eksportér dit arbejdsrum, og godkend fjernelse af de ældste dataversioner, før du gemmer den nye.",
    );
  return { ...doc, dataset: next, datasetHistory: plan.history };
}
export function holdoutDataset(
  doc: Pick<FlowDocument, "dataset" | "datasetHistory" | "holdout">,
): Dataset | null {
  const source = doc.holdout?.source;
  if (!source) return null;
  return (
    [doc.dataset, ...doc.datasetHistory].find(
      (dataset) =>
        dataset &&
        (source.id
          ? dataset.id === source.id
          : dataset.sha256 === source.sha256 &&
            dataset.unit === source.unit &&
            dataset.result.rows.length === source.rows),
    ) ?? null
  );
}
