import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  compareModels,
  ENGINE_VERSION,
  PRNG_VERSION,
} from "../../packages/flow-engine/src/index";
import * as flowDocumentModule from "../../apps/flowlab/src/lib/document";
import * as flowReportModule from "../../apps/flowlab/src/lib/report";
import * as flowWorkspaceModule from "../../apps/flowlab/src/lib/workspace";
import * as directorArchiveModule from "../../apps/director/src/lib/project-archive";
import {
  parseProject,
  totalFrames,
} from "../../packages/scene-format/src/index";
import * as studioModelModule from "../../apps/studio/src/lib/model";
import * as studioLimitsModule from "../../apps/studio/src/lib/limits";
import * as studioArchiveModule from "../../apps/studio/src/lib/archive";
import type { Artifact } from "../../apps/studio/src/lib/model";
// Next app source packages are CommonJS-scoped; this tool itself is ESM.
function appModule<T>(module: T): T {
  return (module as T & { default?: T }).default ?? module;
}
const { initialDocument } = appModule(flowDocumentModule);
const { createReport, reportPdf } = appModule(flowReportModule);
const { serializeWorkspace, importWorkspace } = appModule(flowWorkspaceModule);
const { importPackage: importDirectorPackage } = appModule(
  directorArchiveModule,
);
const {
  addArtifact,
  addDependency,
  addTask,
  artifactBytes,
  artifactSchema,
  beginManualRun,
  createProject,
  saveBrief,
  submitDelivery,
} = appModule(studioModelModule);
const { bytesToBase64 } = appModule(studioLimitsModule);
const { exportProject, importProject } = appModule(studioArchiveModule);

const directory = "examples/foerste-gennemgang";
await mkdir(directory, { recursive: true });
const generatedAt = new Date().toISOString();
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const doc = initialDocument();
doc.decision =
  "Syntetisk prøve: Undersøg både restkø, gennemløbstid og ekstra lønomkostning. Der er ikke gennemført holdout eller målt en faktisk forretningsgevinst.";
doc.comparison = await compareModels(doc.baseline, doc.scenario);
const report = createReport(doc);
if (
  report.comparison.seeds.length !== 30 ||
  report.comparison.status !== "completed" ||
  report.comparison.engineVersion !== ENGINE_VERSION ||
  [...report.comparison.baselineRuns, ...report.comparison.scenarioRuns].some(
    (run) => run.prngVersion !== PRNG_VERSION,
  )
)
  throw new Error(
    "The actual FlowLab comparison is incomplete or incompatible.",
  );
const pdf = await reportPdf(report, {
  regular: new Uint8Array(
    await readFile("apps/flowlab/public/fonts/dm-sans-regular.ttf"),
  ),
  bold: new Uint8Array(
    await readFile("apps/flowlab/public/fonts/manrope-bold.ttf"),
  ),
});
const moviePath = "reports/director/det-sidste-signal-720p.mp4";
const movie = new Uint8Array(await readFile(moviePath));
const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", moviePath],
    { encoding: "utf8", timeout: 20_000 },
  ),
);
const video = probe.streams.find(
  (s: { codec_type: string }) => s.codec_type === "video",
);
const audio = probe.streams.find(
  (s: { codec_type: string }) => s.codec_type === "audio",
);
if (
  video?.codec_name !== "h264" ||
  video.width !== 1280 ||
  video.height !== 720 ||
  video.avg_frame_rate !== "24/1" ||
  Number(video.nb_frames) !== 1440 ||
  Number(probe.format.duration) !== 60 ||
  audio?.codec_name !== "aac"
)
  throw new Error(
    "The actual Director movie does not match the documented sample.",
  );
const storyboard = new Uint8Array(
  await readFile("reports/director/sample-storyboard.pdf"),
);
const flowWorkspace = new TextEncoder().encode(serializeWorkspace(doc));
const restoredFlow = importWorkspace(new TextDecoder().decode(flowWorkspace));
if (
  !isDeepStrictEqual(restoredFlow.baseline, doc.baseline) ||
  !isDeepStrictEqual(restoredFlow.scenario, doc.scenario) ||
  restoredFlow.baseSeed !== doc.baseSeed ||
  restoredFlow.comparison !== null ||
  restoredFlow.holdout !== null
)
  throw new Error(
    "The editable FlowLab model did not preserve its input contract.",
  );
const directorProjectPath = "reports/director/sample-project.zip";
const directorProjectBytes = new Uint8Array(
  await readFile(directorProjectPath),
);
const restoredDirector = await importDirectorPackage(
  directorProjectBytes.buffer,
);
const renderedDirector = parseProject(
  JSON.parse(await readFile("fixtures/director-sample-render.json", "utf8")),
);
if (
  !isDeepStrictEqual(restoredDirector, renderedDirector) ||
  totalFrames(restoredDirector) !== 1440
)
  throw new Error(
    "The editable Director project differs from the actual render source.",
  );
for (const bytes of [pdf, storyboard])
  if (!new TextDecoder().decode(bytes.slice(0, 5)).startsWith("%PDF-"))
    throw new Error("Missing actual PDF.");
const notes = `# Din første gennemgang\n\nDette projekt samler faktiske filer fra tre lokale apps. Det er en manuel prøve med syntetiske data. Ingen cloud eller automatisk forbindelse mellem appsene er oprettet.\n\n1. Åbn leverancen 'En ekstra sagsbehandler'. Hent FlowLab-rapporten og gennemgå både gevinst, restkø, omkostninger og begrænsninger. Rapportens JSON bevarer de 30 faktiske seedpar.\n2. Åbn 'Det sidste signal'. Hent MP4 og storyboard. Filmen er en 60 sekunders animatic på 1280×720/24 fps med et lydspor, der er stille i denne eksempelversion. Der er ingen kontinuerlig karakteranimation.\n3. Skriv dit eget review af begge leverancer. Acceptér eller bed om en rettelse. Ingen brugerbeslutning er truffet på forhånd.\n4. Opgaven 'Vælg dit næste rigtige forsøg' bliver først klar, når begge forudsætninger er accepteret. Skriv et lille næste skridt; eksemplet er ikke bevis for en realiseret forretningsgevinst.\n\nAlle filer har originale bytes, ophav og SHA-256 i Studio-pakken. Hent en ny projektpakke efter dit review.\n`;
let project = createProject(
  "Tre apps · første gennemgang",
  "En analyse, en film og dit review. Faktiske filer fra de lokale apps; alle data er syntetiske.",
);
project = saveBrief(project, {
  goal: "Gennemgå to konkrete eksempelresultater og vælg et afgrænset næste forsøg.",
  audience: "Dig, der vil afprøve de tre apps før dit eget projekt.",
  constraints:
    "Syntetiske data. Ingen kundeoplysninger, betalte kald, cloudforbindelse eller automatisk forretningsgodkendelse. Studio-forløbene er manuelle.",
  acceptance: [
    "Begge leverancer har et selvstændigt review",
    "Begrænsningerne indgår i beslutningen",
    "Næste forsøg er konkret og afgrænset",
  ],
});
const sources: Array<{
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  kind: Artifact["kind"];
  source: string;
}> = [
  {
    id: "laes-mig",
    name: "LAES-MIG.md",
    mime: "text/markdown",
    bytes: new TextEncoder().encode(notes),
    kind: "document",
    source: "tools/demo/create-review-package.ts · dansk vejledning",
  },
  {
    id: "flow-rapport",
    name: "flowlab-rapport.pdf",
    mime: "application/pdf",
    bytes: pdf,
    kind: "document",
    source: `Faktisk lokal 30-par beregning; ${ENGINE_VERSION}, ${PRNG_VERSION}; syntetisk Medlemsservice. Ingen holdout.`,
  },
  {
    id: "flow-grundlag",
    name: "flowlab-grundlag.json",
    mime: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify(report, null, 2)),
    kind: "evidence",
    source:
      "Samme faktiske beregning som flowlab-rapport.pdf; låste modeller, seeds og resultater.",
  },
  {
    id: "director-film",
    name: "det-sidste-signal.mp4",
    mime: "video/mp4",
    bytes: movie,
    kind: "other",
    source: `Original verificeret lokal FFmpeg-eksport fra ${moviePath}; syntetisk animatic med stillbilleder og stille AAC-spor.`,
  },
  {
    id: "director-board",
    name: "det-sidste-signal-storyboard.pdf",
    mime: "application/pdf",
    bytes: storyboard,
    kind: "document",
    source:
      "Original reports/director/sample-storyboard.pdf; syntetisk storyboard fra Director.",
  },
];
for (const file of sources) {
  project = addArtifact(
    project,
    artifactSchema.parse({
      id: `${file.id}-v1`,
      artifactId: file.id,
      version: 1,
      name: file.name,
      mime: file.mime,
      content: bytesToBase64(file.bytes),
      encoding: "base64",
      sha256: hash(file.bytes),
      bytes: file.bytes.length,
      kind: file.kind,
      provenance: file.source,
      rights: "owned",
      createdAt: generatedAt,
    }),
  );
}
const taskIds: string[] = [];
for (const item of [
  {
    title: "Gennemgå FlowLab-analysen",
    delivery: "En ekstra sagsbehandler",
    outputs: ["flow-rapport-v1", "flow-grundlag-v1"],
    criteria: [
      "Rapportens grundlag indeholder 30 fuldførte seedpar",
      "Motor- og PRNG-version er registreret",
      "Syntetiske data og manglende holdout er synlige",
    ],
    summary:
      "En frisk lokal sammenligning med de faktiske 30 seedpar. PDF og JSON bruger samme resultat. Vurder selv afvejningen mellem tider, restkø og løn. Ingen faktisk gevinst eller holdout-godkendelse påstås.",
  },
  {
    title: "Gennemgå Director-filmen",
    delivery: "Det sidste signal",
    outputs: ["director-film-v1", "director-board-v1"],
    criteria: [
      "Filmen er H.264 i 1280×720 ved 24 fps",
      "Varigheden er 60 sekunder med 1.440 videoframes",
      "Det stille AAC-spor og animatic-formatet er beskrevet",
    ],
    summary:
      "Original MP4 og storyboard fra den verificerede lokale prøve. Generatoren har målt format og varighed med ffprobe på den faktiske fil. Lydsporet er stille. Gennemse fortælling og billeder, før du tager stilling.",
  },
]) {
  project = addTask(
    project,
    item.title,
    "Gennemgå de konkrete filer. Skriv din egen vurdering; eksemplet er ikke accepteret på forhånd.",
    {
      owner: "Mig",
      acceptance: item.criteria,
    },
  );
  const taskId = project.tasks.at(-1)!.id;
  taskIds.push(taskId);
  project = beginManualRun(
    project,
    taskId,
    `demo-${taskIds.length}`,
    undefined,
    ["laes-mig-v1"],
  );
  const run = project.runs.at(-1)!;
  project = submitDelivery(project, run.id, {
    title: item.delivery,
    summary: item.summary,
    outputVersionIds: item.outputs,
    checks: item.criteria.map((label, index) => ({
      id: `demo-${taskIds.length}-check-${index + 1}`,
      label,
      passed: true,
      source: "sample" as const,
      evidence:
        "Syntetisk eksempelleverance. Generatoren kontrollerer filernes faktiske grundlag; dit review og din accept mangler stadig. Se tools/demo/create-review-package.ts og manifest.json.",
    })),
  });
}
project = addTask(
  project,
  "Vælg dit næste rigtige forsøg",
  "Beskriv én konkret ændring, og hvilken observation der skal afgøre, om den er nyttig. Afventer de to reviews.",
  {
    owner: "Mig",
    acceptance: [
      "Ét afgrænset næste forsøg er beskrevet",
      "En observation og en begrænsning er angivet",
    ],
  },
);
for (const from of taskIds)
  project = addDependency(project, from, project.tasks.at(-1)!.id);
const zip = await exportProject(project);
const restored = await importProject(zip);
for (const file of sources) {
  const restoredFile = restored.artifacts.find(
    (a) => a.artifactId === file.id,
  )!;
  if (hash(artifactBytes(restoredFile)) !== hash(file.bytes))
    throw new Error(`Roundtrip changed ${file.name}.`);
}
if (
  restored.reviews.length ||
  restored.deliveries.length !== 2 ||
  restored.tasks.length !== 3
)
  throw new Error("Unexpected review fixture state.");
await writeFile(`${directory}/tre-apps-review.zip`, zip);
await writeFile(`${directory}/flowlab-modelpakke.json`, flowWorkspace);
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      generatedAt,
      profile: "synthetic-local-manual-review",
      generator: "tools/demo/create-review-package.ts",
      archive: {
        path: "tre-apps-review.zip",
        bytes: zip.length,
        sha256: hash(zip),
      },
      projectId: project.id,
      reviewDecisions: 0,
      editableProjects: {
        flowlab: {
          path: "flowlab-modelpakke.json",
          bytes: flowWorkspace.length,
          sha256: hash(flowWorkspace),
          importedResults: false,
          recalculationRequired: true,
        },
        director: {
          path: "../../reports/director/sample-project.zip",
          bytes: directorProjectBytes.length,
          sha256: hash(directorProjectBytes),
          renderSourceMatches: true,
          frames: totalFrames(restoredDirector),
        },
      },
      flow: {
        engine: ENGINE_VERSION,
        prng: PRNG_VERSION,
        pairedSeeds: report.comparison.seeds,
        holdout: false,
      },
      director: {
        width: video.width,
        height: video.height,
        fps: video.avg_frame_rate,
        frames: Number(video.nb_frames),
        duration: Number(probe.format.duration),
        video: video.codec_name,
        audio: audio.codec_name,
        audioContent: "silent sample",
      },
      files: sources.map((f) => ({
        name: f.name,
        bytes: f.bytes.length,
        sha256: hash(f.bytes),
        provenance: f.source,
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    archive: `${directory}/tre-apps-review.zip`,
    bytes: zip.length,
    fileCount: sources.length,
    seedPairs: report.comparison.seeds.length,
    reviews: restored.reviews.length,
    verifiedRoundtrip: true,
    editableFlowModelBytes: flowWorkspace.length,
    directorSourceVerified: true,
  }),
);
