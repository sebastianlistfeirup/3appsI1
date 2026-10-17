const MiB = 1024 * 1024;
/** Byte limits shared by the file preflight and the isolated archive worker. */
export const ARCHIVE_LIMITS = {
  archiveBytes: 100 * MiB,
  expandedProjectBytes: 150 * MiB,
  totalExtractedBytes: 151 * MiB,
  metadataBytes: 16 * MiB,
  manifestBytes: MiB,
  blobBytes: 50 * MiB,
  blobs: 1250,
};
