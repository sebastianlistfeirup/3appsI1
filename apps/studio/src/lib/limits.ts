/** Shared local limits keep every admitted project portable in a bounded ZIP. */
export const MAX_ARCHIVE_BYTES = 64_000_000;
export const MAX_EXPANDED_BYTES = 60_000_000;
export const MAX_PROJECT_FILE_BYTES = 48_000_000;
export const MAX_PROJECT_METADATA_BYTES = 4_000_000;
export function projectMetadata<T extends { artifacts: { content: string }[] }>(
  project: T,
) {
  return {
    ...project,
    artifacts: project.artifacts.map(
      ({ content: _content, ...metadata }) => metadata,
    ),
  };
}
export function assertProjectBudget(project: {
  artifacts: { content: string; bytes: number }[];
  [key: string]: unknown;
}) {
  if (
    project.artifacts.reduce((total, artifact) => total + artifact.bytes, 0) >
    MAX_PROJECT_FILE_BYTES
  )
    throw new Error(
      "Projektets filversioner må tilsammen fylde 48 MB. Opret et nyt projekt for mere materiale; historikken bliver bevaret.",
    );
  if (
    new TextEncoder().encode(JSON.stringify(projectMetadata(project)))
      .byteLength > MAX_PROJECT_METADATA_BYTES
  )
    throw new Error(
      "Projektets bestillinger og historik fylder over 4 MB. Opret et nyt projekt for det videre arbejde.",
    );
}
export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(chunks.join(""));
}
export const decodeUtf8 = (bytes: Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
