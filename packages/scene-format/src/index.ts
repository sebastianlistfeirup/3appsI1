import { z } from "zod";

export const FPS = 24;
export const RENDERER_VERSION = "director-primitives-1.0";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().max(2000);
const vector = z.tuple([
  z.number().finite().min(-100).max(100),
  z.number().finite().min(-100).max(100),
  z.number().finite().min(-100).max(100),
]);
const quaternion = z
  .tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ])
  .refine(
    (q) => Math.abs(Math.hypot(...q) - 1) < 0.001,
    "Rotation skal være en normaliseret quaternion",
  );
const transform = z.object({
  position: vector,
  quaternion,
  scale: z.tuple([
    z.number().min(0.05).max(20),
    z.number().min(0.05).max(20),
    z.number().min(0.05).max(20),
  ]),
});
export const objectSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  kind: z.enum(["person", "console", "crate", "lamp", "wall", "glb"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  transform,
  assetVersion: z.number().int().positive(),
  assetId: id.nullable().default(null),
  source: z.string().max(200),
  rights: z.enum(["owned", "licensed", "unknown"]),
});
export const cameraSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  position: vector,
  quaternion,
  target: vector,
  verticalFov: z.number().min(15).max(90),
  near: z.number().min(0.01).max(1),
  far: z.number().min(10).max(1000),
  aspect: z.literal("16:9"),
});
export const glbAssetSchema = z.object({
  id,
  name: z.string().min(1).max(150),
  dataUrl: z
    .string()
    .max(70_000_000)
    .regex(/^data:model\/gltf-binary;base64,[a-zA-Z0-9+/=]+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  triangles: z.number().int().min(1).max(100000),
  source: z.string().min(1).max(200),
  rights: z.enum(["owned", "licensed", "unknown"]),
});
export type GlbAsset = z.infer<typeof glbAssetSchema>;
export const sceneSchema = z
  .object({
    id,
    schemaVersion: z.literal(1),
    rendererVersion: z.literal(RENDERER_VERSION),
    version: z.number().int().positive(),
    name: z.string().min(1).max(100),
    objects: z.array(objectSchema).max(40),
    cameras: z.array(cameraSchema).min(1).max(20),
    assets: z.array(glbAssetSchema).max(10).default([]),
    light: z.object({
      intensity: z.number().min(0.2).max(3),
      warmth: z.enum(["amber", "blue"]),
    }),
  })
  .superRefine((scene, ctx) => {
    for (const object of scene.objects)
      if (
        object.kind === "glb" &&
        !scene.assets.some((a) => a.id === object.assetId)
      )
        ctx.addIssue({
          code: "custom",
          message: "GLB-objektets modelversion mangler",
        });
    if (new Set(scene.assets.map((a) => a.id)).size !== scene.assets.length)
      ctx.addIssue({ code: "custom", message: "Dubleret GLB-asset" });
    if (
      scene.objects.reduce(
        (n, o) =>
          n +
          (o.kind === "glb"
            ? (scene.assets.find((a) => a.id === o.assetId)?.triangles ?? 0)
            : 0),
        0,
      ) > 500000
    )
      ctx.addIssue({
        code: "custom",
        message: "Scenen må højst bruge 500.000 importerede trekanter",
      });
    for (const list of [scene.objects, scene.cameras])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Objekt- og kamera-id skal være unikke",
        });
  });
const frameSchema = z
  .string()
  .max(5_500_000)
  .refine(
    (v) => /^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(v),
    "Frame skal være et PNG- eller JPEG-billede",
  );
export const mediaSchema = z
  .object({
    id,
    name: z.string().max(150),
    kind: z.enum(["image", "video", "audio"]),
    mime: z.enum([
      "image/png",
      "image/jpeg",
      "video/mp4",
      "video/webm",
      "audio/wav",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/webm",
    ]),
    dataUrl: z.string().max(70_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024),
    durationFrames: z
      .number()
      .int()
      .nonnegative()
      .max(24 * 3600)
      .optional(),
    source: text,
    rights: z.enum(["owned", "licensed", "unknown"]),
  })
  .superRefine((m, ctx) => {
    if (
      !m.dataUrl.startsWith(`data:${m.mime};base64,`) ||
      !/^data:[^;]+;base64,[a-zA-Z0-9+/=]+$/.test(m.dataUrl)
    )
      ctx.addIssue({ code: "custom", message: "Ugyldig mediefil" });
    if (
      !m.mime.startsWith(
        m.kind === "image"
          ? "image/"
          : m.kind === "video"
            ? "video/"
            : "audio/",
      )
    )
      ctx.addIssue({ code: "custom", message: "Medietype stemmer ikke" });
  });
export const shotSchema = z.object({
  id,
  version: z.number().int().positive(),
  name: z.string().min(1).max(100),
  sceneVersionId: id,
  cameraId: id,
  durationFrames: z.number().int().min(1).max(2880),
  dialogue: text,
  notes: text,
  frame: frameSchema.nullable(),
  frameRenderer: z.string().max(100).nullable(),
  frameMode: z.enum(["3d", "plan"]).default("3d"),
  clipAudio: z.boolean().default(false),
  mediaId: id.nullable(),
  sourceIn: z.number().int().nonnegative(),
  transitionFrames: z.number().int().min(0).max(48),
  tags: z.array(z.string().max(60)).max(12),
});
const audioSchema = z.object({
  mediaId: id,
  volume: z.number().min(0).max(1),
  startFrame: z.number().int().min(0).max(2880),
  sourceIn: z.number().int().nonnegative().max(86400),
  fadeFrames: z.number().int().min(0).max(120),
  duck: z.boolean(),
});
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    title: z.string().min(1).max(120),
    brief: text,
    fps: z.literal(24),
    aspect: z.literal("16:9"),
    captions: z.boolean().default(true),
    draft: sceneSchema,
    scenes: z.array(sceneSchema).min(1).max(100),
    shots: z.array(shotSchema).max(200),
    sequence: z.array(id).max(30),
    media: z.array(mediaSchema).max(40),
    voice: audioSchema.nullable(),
    music: audioSchema.nullable(),
    revision: z.number().int().nonnegative(),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    for (const list of [p.scenes, p.shots, p.media])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        issue("Dubleret versions-id");
    if (new Set(p.sequence).size !== p.sequence.length)
      issue("Et shot må kun optræde én gang i sekvensen; duplikér det først");
    for (const s of p.shots) {
      const scene = p.scenes.find((v) => v.id === s.sceneVersionId);
      if (!scene || !scene.cameras.some((c) => c.id === s.cameraId))
        issue("Shot henviser til en manglende scene eller et kamera");
      if (
        s.mediaId &&
        !p.media.some((m) => m.id === s.mediaId && m.kind !== "audio")
      )
        issue("Shot-medie mangler");
    }
    for (const sid of p.sequence)
      if (!p.shots.some((s) => s.id === sid))
        issue("Sekvensen henviser til et manglende shot");
    for (const a of [p.voice, p.music])
      if (a && !p.media.some((m) => m.id === a.mediaId && m.kind === "audio"))
        issue("Lydmedie mangler");
    const sequence = p.sequence
      .map((sid) => p.shots.find((s) => s.id === sid))
      .filter((s): s is z.infer<typeof shotSchema> => !!s);
    for (let i = 0; i < sequence.length; i++) {
      const s = sequence[i];
      if (i === 0 && s.transitionFrames)
        issue("Første shot kan ikke overlappe et tidligere shot");
      if (
        i > 0 &&
        s.transitionFrames >=
          Math.min(s.durationFrames, sequence[i - 1].durationFrames)
      )
        issue("Overgang skal være kortere end begge shots");
      if (
        i < sequence.length - 1 &&
        s.transitionFrames + sequence[i + 1].transitionFrames >=
          s.durationFrames
      )
        issue("To overgange må ikke overlappe hinanden inde i samme shot");
      const m = p.media.find((m) => m.id === s.mediaId);
      if (
        m?.kind === "video" &&
        m.durationFrames !== undefined &&
        s.sourceIn + s.durationFrames > m.durationFrames
      )
        issue("Kliptrim overskrider kildens varighed");
    }
    for (const a of [p.voice, p.music]) {
      if (!a) continue;
      const media = p.media.find((m) => m.id === a.mediaId);
      if (
        media?.durationFrames !== undefined &&
        a.sourceIn >= media.durationFrames
      )
        issue("Lydtrim ligger uden for optagelsen");
    }
    if (
      sequence.reduce((n, s) => n + s.durationFrames - s.transitionFrames, 0) >
      2880
    )
      issue("Sekvensen må højst være 120 sekunder");
  });
export type SceneObject = z.infer<typeof objectSchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type SceneVersion = z.infer<typeof sceneSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Vector = [number, number, number];
export function parseProject(input: unknown): Project {
  const result = projectSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw Error(
      first.code === "custom"
        ? first.message
        : `Ugyldigt projektfelt: ${first.path.join(".") || "projekt"}. Kontrollér format og grænser.`,
    );
  }
  return result.data;
}
export function orderedShots(project: Project): Shot[] {
  return project.sequence.map((id) => project.shots.find((s) => s.id === id)!);
}
export function totalFrames(project: Project) {
  return orderedShots(project).reduce(
    (n, s) => n + s.durationFrames - s.transitionFrames,
    0,
  );
}
export function timecode(frames: number) {
  const f = Math.max(0, Math.round(frames));
  return `${String(Math.floor(f / 1440)).padStart(2, "0")}:${String(Math.floor(f / 24) % 60).padStart(2, "0")}:${String(f % 24).padStart(2, "0")}`;
}
export function timeline(project: Project) {
  let start = 0;
  return orderedShots(project).map((s) => {
    start -= s.transitionFrames;
    const item = {
      ...s,
      startFrame: start,
      endFrame: start + s.durationFrames,
    };
    start += s.durationFrames;
    return item;
  });
}
export function sceneForShot(p: Project, s: Shot) {
  return p.scenes.find((v) => v.id === s.sceneVersionId)!;
}
export function changedObjectIds(old: SceneVersion, current: SceneVersion) {
  const ids = new Set([
    ...old.objects.map((o) => o.id),
    ...current.objects.map((o) => o.id),
  ]);
  return [...ids].filter(
    (id) =>
      JSON.stringify(old.objects.find((o) => o.id === id)) !==
      JSON.stringify(current.objects.find((o) => o.id === id)),
  );
}
export function affectedShots(p: Project) {
  return orderedShots(p).filter((s) => {
    const old = sceneForShot(p, s);
    return (
      changedObjectIds(old, p.draft).length > 0 ||
      JSON.stringify(old.light) !== JSON.stringify(p.draft.light) ||
      JSON.stringify(old.cameras.find((c) => c.id === s.cameraId)) !==
        JSON.stringify(p.draft.cameras.find((c) => c.id === s.cameraId))
    );
  });
}
export function clone<T>(value: T): T {
  return structuredClone(value);
}
export function newId(prefix: string) {
  return `${prefix}_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}
export function publishScene(p: Project): Project {
  const next = clone(p);
  const scene = {
    ...clone(p.draft),
    id: newId("scene"),
    version: Math.max(...p.scenes.map((s) => s.version)) + 1,
  };
  next.scenes.push(scene);
  next.draft = clone(scene);
  next.revision++;
  return parseProject(next);
}
export function reviseShot(
  p: Project,
  shotId: string,
  patch: Partial<Omit<Shot, "id" | "version">>,
): Project {
  const next = clone(p);
  const old = next.shots.find((s) => s.id === shotId);
  if (!old) throw Error("Shot findes ikke");
  const shot = {
    ...old,
    ...patch,
    id: newId("shot"),
    version: old.version + 1,
  };
  next.shots.push(shot);
  next.sequence = next.sequence.map((id) => (id === shotId ? shot.id : id));
  next.revision++;
  return parseProject(next);
}
export function moveShot(p: Project, shotId: string, delta: number): Project {
  const next = clone(p);
  const at = next.sequence.indexOf(shotId);
  const dest = at + delta;
  if (at < 0 || dest < 0 || dest >= next.sequence.length) return p;
  [next.sequence[at], next.sequence[dest]] = [
    next.sequence[dest],
    next.sequence[at],
  ];
  const first = next.shots.find((s) => s.id === next.sequence[0]);
  if (first?.transitionFrames)
    return reviseShot(next, first.id, { transitionFrames: 0 });
  next.revision++;
  return parseProject(next);
}
export function rightsWarnings(p: Project) {
  return [
    ...new Set([
      ...p.scenes.flatMap((scene) =>
        scene.objects.filter((o) => o.rights === "unknown").map((o) => o.name),
      ),
      ...p.draft.assets
        .filter((a) => a.rights === "unknown")
        .map((a) => a.name),
      ...p.draft.objects
        .filter((o) => o.rights === "unknown")
        .map((o) => o.name),
      ...p.media.filter((m) => m.rights === "unknown").map((m) => m.name),
    ]),
  ];
}
export function assertPublishable(p: Project) {
  const unknown = rightsWarnings(p);
  if (unknown.length) throw Error(`Rettigheder mangler: ${unknown.join(", ")}`);
}

// Right-handed camera, Y up. Quaternion rotates local -Z toward target.
export function lookAtQuaternion(
  position: Vector,
  target: Vector,
): [number, number, number, number] {
  const norm = (v: Vector): Vector => {
    const l = Math.hypot(...v);
    if (l < 1e-8) throw Error("Kamera og mål skal være forskellige");
    return v.map((n) => n / l) as Vector;
  };
  const z = norm(position.map((n, i) => n - target[i]) as Vector);
  let x: Vector = [z[2], 0, -z[0]];
  if (Math.hypot(...x) < 1e-6) x = [1, 0, 0];
  x = norm(x);
  const y: Vector = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  const m00 = x[0],
    m01 = y[0],
    m02 = z[0],
    m10 = x[1],
    m11 = y[1],
    m12 = z[1],
    m20 = x[2],
    m21 = y[2],
    m22 = z[2],
    trace = m00 + m11 + m22;
  let q: Vector = [0, 0, 0],
    w = 1;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    w = s / 4;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4];
  }
  return [...q, w];
}
export function camera(
  name: string,
  id: string,
  position: Vector,
  target: Vector,
  fov = 42,
): Camera {
  return {
    id,
    name,
    position,
    target,
    quaternion: lookAtQuaternion(position, target),
    verticalFov: fov,
    near: 0.1,
    far: 300,
    aspect: "16:9",
  };
}
export function createSampleProject(): Project {
  const object = (
    id: string,
    name: string,
    kind: SceneObject["kind"],
    position: Vector,
    color: string,
    scale: Vector = [1, 1, 1],
  ): SceneObject => ({
    id,
    name,
    kind,
    color,
    assetVersion: 1,
    assetId: null,
    transform: { position, quaternion: [0, 0, 0, 1], scale },
    source: "Director · egen procedurel primitive",
    rights: "owned",
  });
  const scene: SceneVersion = {
    id: "scene_v1",
    schemaVersion: 1,
    rendererVersion: RENDERER_VERSION,
    version: 1,
    name: "Observationsdæk · Station 07",
    objects: [
      object("captain", "Kaptajn Liv", "person", [-1.2, 0, 0], "#c36536"),
      object("engineer", "Tekniker Noa", "person", [1.45, 0, -1.1], "#a8b8ad"),
      object("terminal", "Signalterminal", "console", [0, 0, -2.1], "#364846"),
      object("cargo", "Forsyningskasse", "crate", [-3, 0, 1.3], "#817360"),
      object("beacon", "Signallys", "lamp", [3, 0, -2.7], "#e8a363"),
    ],
    cameras: [
      camera("Det sidste signal", "cam_01", [5, 3, 8.5], [0, 1, -1], 44),
      camera("Noget derude", "cam_02", [-3.8, 1.9, 3.3], [-1.1, 1.35, 0], 34),
      camera(
        "En gammel frekvens",
        "cam_03",
        [3.7, 1.85, 2.6],
        [1.3, 1.4, -1.1],
        38,
      ),
      camera("Vi er ikke alene", "cam_04", [0, 2.7, 3.5], [0, 1, -2], 45),
      camera("Sæt kursen", "cam_05", [-5, 2.6, 6.5], [0, 1, -1], 48),
    ],
    assets: [],
    light: { intensity: 1, warmth: "amber" },
  };
  const names = [
    "Det sidste signal",
    "Noget derude",
    "En gammel frekvens",
    "Vi er ikke alene",
    "Sæt kursen",
  ];
  const dialogue = [
    "Station 07. Sidste vagt før solopgang.",
    "Vent. Der er noget på den gamle frekvens.",
    "Det er ikke støj. Nogen svarer os.",
    "Efter alle de år … vi er ikke alene.",
    "Sæt kursen. Vi tager hjem.",
  ];
  const shots: Shot[] = names.map((name, i) => ({
    id: `shot_0${i + 1}_v1`,
    version: 1,
    name,
    sceneVersionId: scene.id,
    cameraId: scene.cameras[i].id,
    durationFrames: 288,
    dialogue: dialogue[i],
    notes: [
      "Total. Et øde observationsdæk ved en fremmed horisont.",
      "Halvnær på Liv. Hun lytter til signalet.",
      "Modbillede. Noa finder en kendt rytme.",
      "Indklip på terminalen. Håbet tænder.",
      "Total. To figurer vender sig mod den nye dag.",
    ][i],
    frame: null,
    frameRenderer: null,
    frameMode: "3d",
    clipAudio: false,
    mediaId: null,
    sourceIn: 0,
    transitionFrames: 0,
    tags: [i === 0 || i === 4 ? "Total" : i === 3 ? "Indklip" : "Halvnær"],
  }));
  return parseProject({
    schemaVersion: 1,
    id: "station_07",
    title: "Det sidste signal",
    brief:
      "En stille science fiction-fortælling om to mennesker, et forladt observationsdæk og et signal, der ændrer alt. Varmt lys mod en kold verden. Fra isolation til håb.",
    fps: 24,
    aspect: "16:9",
    draft: clone(scene),
    scenes: [scene],
    shots,
    sequence: shots.map((s) => s.id),
    media: [],
    voice: null,
    music: null,
    revision: 0,
  });
}
export { inspectGlb, type GlbInspection } from "./glb";

/** Inspect dimensions before asking a browser/codec to allocate a decoded image. */
export function inspectRaster(bytes: Uint8Array): {
  width: number;
  height: number;
  format: "png" | "jpeg";
} {
  let width = 0,
    height = 0;
  let format: "png" | "jpeg" = "png";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
      throw Error("PNG IHDR mangler");
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    format = "jpeg";
    let offset = 2;
    while (offset < bytes.length - 3) {
      if (bytes[offset] !== 255) throw Error("Ugyldig JPEG-markør");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length)
        throw Error("Ugyldig JPEG-længde");
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw Error("Ugyldigt JPEG-frame");
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else throw Error("Kun ægte PNG- og JPEG-billeder understøttes");
  if (!width || !height)
    throw Error("Billedets dimensioner kunne ikke aflæses");
  if (width > 8192 || height > 8192 || width * height > 32_000_000)
    throw Error(
      "Billedet må højst være 8192 pixels på hver led og 32 megapixels",
    );
  return { width, height, format };
}
export { previewLayers, previewAudio, duckGain } from "./playback";
