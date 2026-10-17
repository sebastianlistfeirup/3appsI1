import { z } from "zod";
import type { Project } from "@tre/scene-format";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const renderStateSchema = z.object({
  id: z.string().uuid(),
  state: z.enum([
    "queued",
    "running",
    "validating",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  phase: z.string().max(500),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  manifestHash: hash,
  expectedFrames: z.number().int().min(1).max(2880),
  source: z
    .object({
      projectId: id,
      title: z.string().min(1).max(120),
      revision: z.number().int().nonnegative(),
    })
    .optional(),
  sequenceVersion: z
    .object({
      id,
      version: z.number().int().positive(),
      name: z.string().min(1).max(100),
    })
    .optional(),
  error: z.string().max(10000).optional(),
  metadata: z
    .object({
      duration: z.number().finite().min(0).max(121),
      width: z.literal(1280),
      height: z.literal(720),
      fps: z.literal(24),
      sha256: hash,
      audioSampleRate: z.literal(48000),
      codec: z.literal("h264"),
      audioCodec: z.literal("aac"),
      truePeakDbfs: z.number().finite().optional(),
      loudnessLufs: z.number().finite().optional(),
      audioSilent: z.boolean().optional(),
    })
    .optional(),
  reusedSegments: z.number().int().min(0).max(30).optional(),
  captions: z
    .object({
      burnedIn: z.boolean(),
      cues: z.number().int().min(0).max(3000),
      warningShots: z.number().int().min(0).max(30),
      errors: z.array(z.string().max(2000)).max(30),
    })
    .optional(),
  artifacts: z
    .record(
      z.string().regex(/^(captions\.(srt|vtt|json)|validation\.json)$/),
      z.object({
        sha256: hash,
        bytes: z
          .number()
          .int()
          .min(1)
          .max(1024 * 1024),
      }),
    )
    .optional(),
});
export type RenderState = z.infer<typeof renderStateSchema>;
export type RenderHistory = {
  jobs: RenderState[];
  storage: {
    occupiedEntries: number;
    maxJobs: number;
    freeBytes: number;
    minimumFreeBytes: number;
    automaticDeletion: false;
  };
  legacyJobs: number;
  unreadableJobs: number;
};
export function compareRenderSnapshot(
  job: RenderState,
  project: Project,
  currentHash?: string,
): "same" | "different" | "unknown" {
  if (currentHash)
    return job.manifestHash === currentHash ? "same" : "different";
  if (
    job.source &&
    (job.source.projectId !== project.id ||
      job.source.revision !== project.revision)
  )
    return "different";
  return "unknown";
}

/** Header-safe ASCII names retain title, revision and a unique render reference. */
export function renderDownloadName(job: RenderState, artifact = "film.mp4") {
  if (
    ![
      "film.mp4",
      "captions.srt",
      "captions.vtt",
      "captions.json",
      "validation.json",
    ].includes(artifact)
  )
    throw Error("Ukendt eksportfil");
  const title =
    (job.source?.title ?? "film")
      .toLocaleLowerCase("da-DK")
      .replaceAll("æ", "ae")
      .replaceAll("ø", "oe")
      .replaceAll("å", "aa")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "film";
  const revision = job.source ? `-r${job.source.revision}` : "";
  return `director-${title}${revision}-${job.id.slice(0, 8)}${artifact === "film.mp4" ? ".mp4" : `-${artifact}`}`;
}
