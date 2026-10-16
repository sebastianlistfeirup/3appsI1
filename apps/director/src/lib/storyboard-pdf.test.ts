import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createSampleProject } from "@tre/scene-format";
import { storyboardPdf, wrapPdfText } from "./storyboard-pdf";
const fonts = Promise.all(
  ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVu-LICENSE.txt"].map((name) =>
    readFile(new URL(`../../public/fonts/${name}`, import.meta.url)),
  ),
).then(([regular, bold, license]) => ({
  regular,
  bold,
  license: license.toString(),
}));
describe("Portable complete storyboard PDF", () => {
  it("wraps long Unicode tokens at measured widths without dropping characters or paragraphs", async () => {
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const font = await document.embedFont((await fonts).regular),
      input = "Æøå Ωμέγα Привет\n\n" + "LangtOrdUdenMellemrum".repeat(100);
    const lines = wrapPdfText(input, font, 11, 366);
    expect(lines).toContain("");
    expect(lines.join("").replace(/\s/g, "")).toBe(input.replace(/\s/g, ""));
    expect(lines.every((line) => font.widthOfTextAtSize(line, 11) <= 366)).toBe(
      true,
    );
  });
  it("embeds a full immutable manifest, continues long text and records a missing video poster rather than claiming it used a camera frame", async () => {
    const p = createSampleProject(),
      first = p.shots[0];
    p.sequence = [first.id];
    first.dialogue = "Æøå Ωμέγα Привет ".repeat(100) + "SLUTREPLIK";
    first.notes = "FULD NOTE ".repeat(180) + "SLUTNOTE 🚀";
    first.mediaId = "own_clip";
    first.durationFrames = 48;
    first.sourceIn = 96;
    p.media = [
      {
        id: "own_clip",
        name: "Klip.mp4",
        kind: "video",
        mime: "video/mp4",
        dataUrl: "data:video/mp4;base64,AA==",
        sha256: "0".repeat(64),
        bytes: 1,
        durationFrames: 144,
        rights: "owned",
        source: "Eget klip",
      },
    ];
    const before = structuredClone(p),
      warnings: string[] = [];
    const bytes = await storyboardPdf(p, {
      fonts: await fonts,
      poster: async () => {
        throw Error("Browser decoder unavailable");
      },
      onWarning: (message) => warnings.push(message),
    });
    expect(p).toEqual(before);
    expect(warnings[0]).toContain("Browser decoder unavailable");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    const names = pdf.catalog
      .lookup(PDFName.of("Names"), PDFDict)
      .lookup(PDFName.of("EmbeddedFiles"), PDFDict)
      .lookup(PDFName.of("Names"), PDFArray);
    const manifestFile = names.lookup(1, PDFDict),
      stream = manifestFile
        .lookup(PDFName.of("EF"), PDFDict)
        .lookup(PDFName.of("F"));
    if (!(stream instanceof PDFRawStream))
      throw Error("Manifest stream missing");
    const manifest = JSON.parse(
      new TextDecoder().decode(decodePDFRawStream(stream).decode()),
    );
    expect(manifest.production.totalFrames).toBe(48);
    expect(manifest.shots[0].dialogue).toBe(first.dialogue);
    expect(manifest.shots[0].notes).toBe(first.notes);
    expect(manifest.shots[0].poster).toEqual({
      error: "Browser decoder unavailable",
    });
    expect(manifest.shots[0].cameraFrameSha256).toBeNull();
    expect(manifest.shots[0].source.sourceIn).toBe(96);
  });
});
