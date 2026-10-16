import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  parseProject,
  orderedShots,
  sceneForShot,
  timecode,
  timeline,
  totalFrames,
  matchingSequenceVersion,
  type Project,
  type Shot,
} from "@tre/scene-format";
import { dataUrlBytes, sha256 } from "./project-files";
import { shotPoster, type ShotPoster } from "./shot-poster";

export interface StoryboardFonts {
  regular: Uint8Array;
  bold: Uint8Array;
  license: string;
}
interface StoryboardOptions {
  fonts?: StoryboardFonts;
  poster?: (project: Project, shot: Shot) => Promise<ShotPoster | null>;
  onProgress?: (completed: number, total: number) => void;
  onWarning?: (message: string) => void;
}
let fontsRequest: Promise<StoryboardFonts> | null = null;
async function loadFonts() {
  if (!fontsRequest)
    fontsRequest = Promise.all(
      ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVu-LICENSE.txt"].map(
        async (name) => {
          const response = await fetch(`/fonts/${name}`);
          if (!response.ok)
            throw Error(
              "Storyboardets skrifter kunne ikke indlæses. Prøv igen.",
            );
          return new Uint8Array(await response.arrayBuffer());
        },
      ),
    )
      .then(([regular, bold, license]) => ({
        regular,
        bold,
        license: new TextDecoder().decode(license),
      }))
      .catch((error) => {
        fontsRequest = null;
        throw error;
      });
  return fontsRequest;
}

/** Measured line wrapping preserves paragraphs and splits long tokens without dropping text. */
export function wrapPdfText(
  value: string,
  font: PDFFont,
  size: number,
  width: number,
) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.replace(/\t/g, "    ").split(/ +/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function storyboardPdf(
  input: Project,
  options: StoryboardOptions = {},
) {
  const p = parseProject(input),
    shots = orderedShots(p);
  if (!shots.length) throw Error("Tilføj et shot først");
  const doc = await PDFDocument.create(),
    fonts = options.fonts ?? (await loadFonts());
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true }),
    bold = await doc.embedFont(fonts.bold, { subset: true });
  doc.setTitle(`${p.title} · storyboard`);
  doc.setAuthor("Director");
  doc.setCreator("Director · lokalt filmværksted");
  doc.setProducer("Director / pdf-lib");
  doc.setLanguage("da-DK");
  const color = {
    paper: rgb(0.953, 0.945, 0.914),
    ink: rgb(0.1, 0.15, 0.18),
    muted: rgb(0.34, 0.39, 0.4),
    copper: rgb(0.61, 0.28, 0.12),
    line: rgb(0.76, 0.76, 0.7),
    dark: rgb(0.086, 0.102, 0.133),
  };
  const glyphs = new Set(regular.getCharacterSet()),
    boldGlyphs = new Set(bold.getCharacterSet()),
    unsupported = new Set<string>(),
    warnings: string[] = [];
  const safe = (value: string, font = regular) =>
    Array.from(value)
      .map((char) => {
        if (/^[\n\r\t]$/.test(char)) return char;
        const point = char.codePointAt(0)!;
        if ((font === bold ? boldGlyphs : glyphs).has(point)) return char;
        const code = `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
        unsupported.add(code);
        return `[${code}]`;
      })
      .join("");
  const draw = (
    page: PDFPage,
    value: string,
    x: number,
    y: number,
    size = 10,
    font = regular,
    ink = color.ink,
  ) => {
    page.drawText(safe(value, font).replace(/[\r\n\t]/g, " "), {
      x,
      y,
      size,
      font,
      color: ink,
    });
  };
  const fit = (value: string, font: PDFFont, max: number, width: number) =>
    Math.min(
      max,
      (max * width) /
        Math.max(1, font.widthOfTextAtSize(safe(value, font), max)),
    );
  const page = (section: string) => {
    const out = doc.addPage([842, 595]);
    out.drawRectangle({
      x: 0,
      y: 0,
      width: 842,
      height: 595,
      color: color.paper,
    });
    draw(out, `DIRECTOR  /  ${section}`, 38, 557, 9, bold, color.copper);
    draw(out, p.title, 38, 518, fit(p.title, bold, 24, 766), bold);
    draw(
      out,
      `24 fps  ·  16:9  ·  Revision ${p.revision}  ·  ${timecode(totalFrames(p))}`,
      38,
      493,
      10,
      regular,
      color.muted,
    );
    out.drawLine({
      start: { x: 38, y: 481 },
      end: { x: 804, y: 481 },
      thickness: 0.6,
      color: color.line,
    });
    return out;
  };
  const continuation: {
    index: number;
    shot: Shot;
    page: PDFPage;
    x: number;
  }[] = [];
  const manifestShots: Record<string, unknown>[] = [];
  let board: PDFPage;
  const clipTimeline = timeline(p);
  for (let index = 0; index < shots.length; index++) {
    const shot = shots[index],
      scene = sceneForShot(p, shot),
      media = p.media.find((m) => m.id === shot.mediaId),
      x = 38 + (index % 2) * 392;
    if (index % 2 === 0) board = page("STORYBOARD");
    let poster: ShotPoster | null = null,
      posterError: string | null = null;
    try {
      poster = await (options.poster ?? shotPoster)(p, shot);
    } catch (error) {
      posterError =
        error instanceof Error ? error.message : "Billedet kunne ikke læses";
      warnings.push(`Shot ${index + 1}: ${posterError}`);
    }
    if (poster) {
      const image = await doc.embedJpg(poster.bytes);
      board!.drawImage(image, { x, y: 263, width: 366, height: 205.875 });
    } else {
      board!.drawRectangle({
        x,
        y: 263,
        width: 366,
        height: 205.875,
        color: color.dark,
      });
      draw(
        board!,
        media?.kind === "video"
          ? "Klipframe kan ikke vises"
          : "Kameraframe mangler",
        x + 34,
        368,
        13,
        bold,
        color.paper,
      );
      draw(
        board!,
        "Kilden er bevaret i projektet",
        x + 34,
        346,
        10,
        regular,
        color.paper,
      );
    }
    const sourceLabel =
      media?.kind === "video"
        ? `KLIP · fra ${timecode(shot.sourceIn)}`
        : media?.kind === "image"
          ? "EGET BILLEDE"
          : shot.frameMode === "plan"
            ? "2D-PLAN"
            : "KAMERAFRAME";
    draw(
      board!,
      `SHOT ${String(index + 1).padStart(2, "0")}  ·  ${shot.durationFrames / p.fps} sek.  ·  ${sourceLabel}`,
      x,
      246,
      8.5,
      bold,
      color.copper,
    );
    let y = 223;
    for (const line of wrapPdfText(safe(shot.name, bold), bold, 16, 366)) {
      draw(board!, line, x, y, 16, bold);
      y -= 20;
    }
    const blocks = [
      ...wrapPdfText(
        safe(shot.dialogue || "Ingen replik"),
        regular,
        10,
        366,
      ).map((line) => ({ line, note: false })),
      { line: "", note: true },
      ...wrapPdfText(safe(shot.notes || "Ingen noter"), regular, 9, 366).map(
        (line) => ({ line, note: true }),
      ),
    ];
    let overflow = false;
    for (const item of blocks) {
      if (y < 100) {
        overflow = true;
        break;
      }
      draw(
        board!,
        item.line,
        x,
        y,
        item.note ? 9 : 10,
        regular,
        item.note ? color.muted : color.ink,
      );
      y -= 14;
    }
    if (overflow) continuation.push({ index, shot, page: board!, x });
    draw(
      board!,
      `Scene v${scene.version}  ·  Shot v${shot.version}  ·  ${shot.cameraId}`,
      x,
      65,
      8,
      regular,
      color.muted,
    );
    draw(
      board!,
      shot.id,
      x,
      52,
      fit(shot.id, regular, 7, 366),
      regular,
      color.muted,
    );
    manifestShots.push({
      order: index + 1,
      id: shot.id,
      version: shot.version,
      previousShotId: shot.previousShotId,
      name: shot.name,
      sceneVersionId: scene.id,
      sceneVersion: scene.version,
      sceneName: scene.name,
      environment: scene.environment,
      camera: scene.cameras.find((c) => c.id === shot.cameraId),
      rendererVersion: shot.frameRenderer ?? scene.rendererVersion,
      frameMode: media ? media.kind : shot.frameMode,
      timeline: {
        startFrame: clipTimeline[index].startFrame,
        endFrame: clipTimeline[index].endFrame,
        durationFrames: shot.durationFrames,
        transitionFrames: shot.transitionFrames,
      },
      source: media
        ? {
            id: media.id,
            name: media.name,
            sha256: media.sha256,
            bytes: media.bytes,
            sourceIn: shot.sourceIn,
            sourceOutExclusive: shot.sourceIn + shot.durationFrames,
            clipAudio: shot.clipAudio,
            rights: media.rights,
            provenance: media.source,
          }
        : null,
      cameraFrameSha256:
        !media && shot.frame ? await sha256(dataUrlBytes(shot.frame)) : null,
      poster: poster
        ? {
            source: poster.source,
            sourceFrame: poster.sourceFrame,
            sha256: await sha256(poster.bytes),
            width: 1280,
            height: 720,
          }
        : { error: posterError ?? "Kameraframe mangler" },
      dialogue: shot.dialogue,
      notes: shot.notes,
      tags: shot.tags,
      objects: scene.objects.map((object) => ({
        id: object.id,
        name: object.name,
        assetVersion: object.assetVersion,
        assetId: object.assetId,
        transform: object.transform,
        color: object.color,
        source: object.source,
        rights: object.rights,
      })),
      assets: scene.assets.map(({ dataUrl: _, ...asset }) => asset),
      light: scene.light,
    });
    options.onProgress?.(index + 1, shots.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  let textPage: PDFPage,
    y = 0,
    section = "PRODUKTIONSNOTER";
  const freshTextPage = () => {
    textPage = page(section);
    y = 457;
  };
  const textBlock = (label: string, content: string, size = 11) => {
    if (y < 100) freshTextPage();
    draw(textPage, label, 38, y, 10, bold, color.copper);
    y -= 22;
    for (const line of wrapPdfText(safe(content), regular, size, 766)) {
      if (y < 55) freshTextPage();
      draw(textPage, line, 38, y, size);
      y -= size + 5;
    }
    y -= 15;
  };
  for (const item of continuation) {
    section = `SHOT ${String(item.index + 1).padStart(2, "0")} / FULD TEKST`;
    freshTextPage();
    draw(
      item.page,
      `Fuld replik og noter: side ${doc.getPageCount()}`,
      item.x,
      83,
      8,
      bold,
      color.copper,
    );
    textBlock("INDSTILLING", item.shot.name, 15);
    textBlock("REPLIK", item.shot.dialogue || "Ingen replik");
    textBlock("NOTER", item.shot.notes || "Ingen noter");
    if (item.shot.tags.length)
      textBlock("KONTINUITETSMÆRKER", item.shot.tags.join(" · "));
  }
  section = "VERSIONSMANIFEST";
  freshTextPage();
  textBlock(
    "PRODUKTION",
    `${p.title}\nProjekt: ${p.id}\nRevision: ${p.revision}\nSekvens: ${totalFrames(p)} frames ved ${p.fps} fps · ${timecode(totalFrames(p))}`,
  );
  if (p.brief) textBlock("BRIEF OG TONE", p.brief);
  textBlock(
    "OM DENNE FIL",
    "Storyboardets billeder er faste kameraframes, egne billeder eller det importerede videoklips første frame efter trim. En 2D-plan er mærket som 2D-plan. Overgange reducerer sekvensens samlede varighed. Fuld tekst, versionsreferencer, kamera, objekter, kildehashes og billedhashes er også indlejret i director-manifest.json. Originale medier hentes med projektpakken.",
    10,
  );
  for (let index = 0; index < shots.length; index++) {
    const shot = shots[index],
      scene = sceneForShot(p, shot),
      data = manifestShots[index],
      media = p.media.find((m) => m.id === shot.mediaId),
      range = clipTimeline[index];
    textBlock(
      `SHOT ${String(index + 1).padStart(2, "0")} · ${shot.name}`,
      [
        `Shot: ${shot.id} · v${shot.version}`,
        `Scene: ${scene.id} · v${scene.version} · kamera ${shot.cameraId}`,
        `Sekvens: ${timecode(range.startFrame)} → ${timecode(range.endFrame)} · ${shot.durationFrames} frames · overgang ${shot.transitionFrames} frames`,
        media
          ? `Kilde: ${media.name} · ${media.kind} · ${media.bytes} bytes\nSHA-256: ${media.sha256}\nTrim: ${shot.sourceIn} → ${shot.sourceIn + shot.durationFrames} frames (slut eksklusiv) · kliplyd ${shot.clipAudio ? "til" : "fra"}`
          : `Billedtype: ${shot.frameMode === "plan" ? "2D-plan" : "kameraframe"} · renderer ${shot.frameRenderer ?? scene.rendererVersion}`,
        `Scene-assets: ${scene.assets.length} · objektversioner: ${scene.objects.map((o) => `${o.name} v${o.assetVersion}`).join(", ") || "ingen"}`,
        shot.tags.length ? `Kontinuitetsmærker: ${shot.tags.join(" · ")}` : "",
        (data.poster as { error?: string }).error
          ? `BILLEDE MANGLER: ${(data.poster as { error: string }).error}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      9,
    );
  }
  for (const [label, track] of [
    ["VOICEOVER", p.voice],
    ["MUSIK", p.music],
  ] as const) {
    if (!track) continue;
    const media = p.media.find((m) => m.id === track.mediaId)!;
    textBlock(
      label,
      `${media.name}\nSHA-256: ${media.sha256}\nStart i sekvens: ${track.startFrame} frames · kilde fra ${track.sourceIn} frames · fade ${track.fadeFrames} frames\nLydstyrke: ${track.volume} · ducking: ${track.duck ? "til" : "fra"}`,
      9,
    );
  }
  if (unsupported.size) {
    const message = `${unsupported.size} tegn vises som Unicode-koder i PDF. Originalteksten er bevaret i det indlejrede manifest.`;
    warnings.push(message);
    textBlock(
      "TEGN UDEN FOR DEN INDBYGGEDE SKRIFT",
      `${message}\n${[...unsupported].join(", ")}`,
      9,
    );
  }
  const manifest = {
    format: "director-storyboard-manifest",
    schemaVersion: 1,
    production: {
      id: p.id,
      title: p.title,
      revision: p.revision,
      brief: p.brief,
      fps: p.fps,
      aspect: p.aspect,
      totalFrames: totalFrames(p),
      sequenceVersion: matchingSequenceVersion(p) ?? null,
    },
    shots: manifestShots,
    voice: p.voice,
    music: p.music,
    warnings,
  };
  await doc.attach(
    new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    "director-manifest.json",
    {
      mimeType: "application/json",
      description: "Versionsmanifest med fuld originaltekst og kildehashes",
    },
  );
  await doc.attach(
    new TextEncoder().encode(fonts.license),
    "DejaVu-LICENSE.txt",
    {
      mimeType: "text/plain",
      description: "Licens til indlejrede DejaVu-skrifter",
    },
  );
  const pages = doc.getPages();
  for (const [index, current] of pages.entries()) {
    current.drawLine({
      start: { x: 38, y: 40 },
      end: { x: 804, y: 40 },
      thickness: 0.6,
      color: color.line,
    });
    draw(
      current,
      "Lokal produktion · dine egne materialer",
      38,
      23,
      8,
      regular,
      color.muted,
    );
    const footer = `${index + 1} / ${pages.length}`;
    draw(
      current,
      footer,
      804 - regular.widthOfTextAtSize(footer, 8),
      23,
      8,
      regular,
      color.muted,
    );
  }
  if (warnings.length) options.onWarning?.(warnings.join(" "));
  return doc.save();
}
