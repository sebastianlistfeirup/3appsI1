import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { metricDefinitions } from "@tre/flow-engine";
import { formatDifference, formatMetric } from "./document";
import type { DecisionReport } from "./report";
import {
  aggregateTimeProfile,
  formatCaseTime,
  TIME_LABELS,
  TIME_METRICS,
} from "./time-profile";
export interface ReportFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}
let fontRequest: Promise<ReportFonts> | null = null;
export async function loadReportFonts(): Promise<ReportFonts> {
  if (!fontRequest)
    fontRequest = Promise.all(
      ["/fonts/dm-sans-regular.ttf", "/fonts/manrope-bold.ttf"].map(
        async (path) => {
          const response = await fetch(path);
          if (!response.ok)
            throw new Error(
              "Rapportens skrifter kunne ikke indlæses. Prøv igen.",
            );
          return new Uint8Array(await response.arrayBuffer());
        },
      ),
    )
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((error) => {
        fontRequest = null;
        throw error;
      });
  return fontRequest;
}
/** Embedded licensed fonts make the PDF self-contained, including Danish æ/ø/å. */
export async function renderReportPdf(
  report: DecisionReport,
  fontBytes?: ReportFonts,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const bytes = fontBytes ?? (await loadReportFonts());
  const regular = await document.embedFont(bytes.regular, { subset: true }),
    bold = await document.embedFont(bytes.bold, { subset: true });
  document.setTitle(`FlowLab · ${report.title}`);
  document.setAuthor("FlowLab");
  document.setCreator("FlowLab local report");
  document.setProducer("FlowLab / pdf-lib");
  document.setCreationDate(new Date(report.generatedAt));
  document.setModificationDate(new Date(report.generatedAt));
  const colors = {
    ink: rgb(0.094, 0.231, 0.231),
    teal: rgb(0, 0.494, 0.471),
    muted: rgb(0.43, 0.53, 0.48),
    pale: rgb(0.937, 0.965, 0.937),
    line: rgb(0.886, 0.918, 0.878),
  };
  const pages: PDFPage[] = [];
  let page: PDFPage;
  const text = (
    x: number,
    y: number,
    value: string,
    size = 10,
    color = colors.ink,
    font: PDFFont = regular,
    maxWidth?: number,
  ) => {
    const safe = value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/[\r\n]+/g, " ");
    const width = font.widthOfTextAtSize(safe, size);
    const fittedSize =
      maxWidth && width > maxWidth
        ? Math.max(Math.min(9, size), (size * maxWidth) / width)
        : size;
    let fitted = safe;
    if (maxWidth && font.widthOfTextAtSize(fitted, fittedSize) > maxWidth) {
      const characters = Array.from(fitted);
      let low = 0,
        high = characters.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (
          font.widthOfTextAtSize(
            characters.slice(0, middle).join("") + "…",
            fittedSize,
          ) <= maxWidth
        )
          low = middle;
        else high = middle - 1;
      }
      fitted = characters.slice(0, low).join("") + "…";
    }
    page.drawText(fitted, { x, y: 842 - y, size: fittedSize, color, font });
  };
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    color = colors.pale,
  ) => page.drawRectangle({ x, y: 842 - y - height, width, height, color });
  const wrap = (value: string, width: number, size: number, font = regular) => {
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        // A URL, ID or pasted unbroken sentence must remain inside the printable area.
        for (const character of word) {
          const next = line + character;
          if (line && font.widthOfTextAtSize(next, size) > width) {
            lines.push(line);
            line = character;
          } else line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const paragraph = (
    x: number,
    y: number,
    value: string,
    width = 511,
    size = 10,
    maxLines = 1000,
  ) => {
    const lines = wrap(value, width, size);
    for (const [i, line] of lines.slice(0, maxLines).entries())
      text(x, y + i * size * 1.6, line, size);
    return {
      end: y + Math.min(lines.length, maxLines) * size * 1.6,
      overflow: lines.length > maxLines,
    };
  };
  const addPage = () => {
    page = document.addPage([595, 842]);
    pages.push(page);
    rect(0, 0, 595, 6, colors.teal);
    text(42, 47, "flowlab", 19, colors.teal, bold);
    text(387, 46, "BESLUTNINGSRAPPORT", 8, colors.muted);
    return page;
  };
  const compact = (value: string, max: number) =>
    value.length <= max ? value : `${value.slice(0, max - 4)}…`;
  const c = report.comparison;
  addPage();
  text(42, 99, report.title, 27, colors.ink, bold, 511);
  text(
    42,
    124,
    `Baseline vs. ${report.scenarioName}`,
    11,
    colors.muted,
    regular,
    511,
  );
  text(
    42,
    146,
    `${c.seeds.length} parrede replikationer · ${formatCaseTime(c.baseline.horizon)} · ${report.generatedAt.slice(0, 10)}`,
    10,
    colors.muted,
  );
  rect(42, 167, 511, 71);
  text(57, 188, "HYPOTESE", 8, colors.teal, bold);
  const hypothesisLines = wrap(
    report.hypothesis || "Ingen hypotese angivet.",
    481,
    10,
  );
  paragraph(57, 208, hypothesisLines.slice(0, 2).join("\n"), 481, 10, 2);
  if (hypothesisLines.length > 2)
    text(57, 231, "Fuld hypotese i bilaget.", 7, colors.muted);
  text(42, 267, "Resultat af sammenligningen", 16, colors.ink, bold);
  text(
    42,
    286,
    "Middelværdi af kørsler. Gennemløbstid: middel af run-medianer.",
    9,
    colors.muted,
  );
  const columns = [42, 222, 328, 438];
  ["MÅLING", "BASELINE", "ALTERNATIV", "FORSKEL"].forEach((label, i) =>
    text(columns[i], 315, label, 8, colors.muted, bold),
  );
  c.metrics.forEach((m, i) => {
    const y = 342 + i * 36;
    if (i % 2 === 0) rect(38, y - 18, 519, 32, rgb(0.97, 0.98, 0.97));
    text(46, y, metricDefinitions[m.key].label, 10, colors.ink, bold, 168);
    text(222, y, formatMetric(m.key, m.baseline), 10, colors.ink, regular, 99);
    text(328, y, formatMetric(m.key, m.scenario), 10, colors.teal, bold, 100);
    text(
      438,
      y,
      `${m.deltaMean !== null && m.deltaMean > 0 ? "+" : ""}${formatDifference(m.key, m.deltaMean).replace(" procentpoint", " pp")}`,
      10,
      colors.ink,
      regular,
      112,
    );
  });
  if (report.diagnostics.length)
    text(
      42,
      596,
      "Motoren har bemærkninger til resultatet. Læs det særskilte bilag.",
      9,
      colors.muted,
    );
  text(42, 624, "Din beslutning", 16, colors.ink, bold);
  const decisionLines = wrap(
    report.decision ||
      "Ingen beslutning tilføjet. Undersøg antagelser, restkø og spredning før en ændring.",
    511,
    10,
  );
  paragraph(42, 648, decisionLines.slice(0, 4).join("\n"), 511, 10, 4);
  if (decisionLines.length > 4)
    text(
      42,
      721,
      "Fuld beslutning og begrundelse findes i bilaget.",
      8,
      colors.muted,
    );
  paragraph(42, 751, report.limitations[0], 511, 9, 2);
  addPage();
  text(42, 99, "Antagelser & usikkerhed", 24, colors.ink, bold);
  text(
    42,
    131,
    "10.–90.-percentil af alternativ minus baseline",
    11,
    colors.muted,
  );
  c.metrics.forEach((m, i) => {
    text(
      42,
      163 + i * 25,
      metricDefinitions[m.key].label,
      10,
      colors.ink,
      bold,
    );
    text(
      242,
      163 + i * 25,
      `${formatDifference(m.key, m.deltaP10).replace(" procentpoint", " pp")} til ${formatDifference(m.key, m.deltaP90).replace(" procentpoint", " pp")} (${m.pairs} par)`,
      10,
      colors.ink,
      regular,
      311,
    );
  });
  text(42, 369, "Ændrede input", 16, colors.ink, bold);
  let y = 391;
  if (!c.differences.length) {
    text(
      42,
      y,
      "Ingen ændrede input. Scenarierne er identiske.",
      10,
      colors.muted,
    );
    y += 20;
  }
  for (const d of c.differences.slice(0, 4)) {
    y =
      paragraph(
        42,
        y,
        compact(
          `${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`,
          135,
        ),
        511,
        9,
        2,
      ).end + 5;
  }
  if (c.differences.length > 4) {
    text(
      42,
      y + 3,
      `+ ${c.differences.length - 4} ændringer. Fuld inputdiff findes i report.json.`,
      8,
      colors.muted,
    );
    y += 18;
  }
  y = Math.max(y + 22, 479);
  text(42, y, "Læs tallene med omtanke", 16, colors.ink, bold);
  y += 23;
  for (const limit of report.limitations) {
    y = paragraph(42, y, `• ${limit}`, 511, 9, 3).end + 6;
  }
  y = Math.min(y + 14, 731);
  text(42, y, "Reproducerbarhed", 13, colors.ink, bold);
  paragraph(
    42,
    y + 20,
    `Motor: ${c.engineVersion}. Modelversion: ${c.baseline.revision}. Fælles seed: ${report.baseSeed}. Målevindue: ${c.baseline.observationStart}–${c.baseline.horizon} ms. Fuld model, seeds, run-metrics, køkurver og inputdiff følger med i JSON-pakken.`,
    511,
    9,
    3,
  );
  addPage();
  text(42, 99, "De afsluttede sagers tider", 23, colors.ink, bold);
  paragraph(
    42,
    126,
    "Hver kørsel har sin egen tidsfordeling. Her vises gennemsnittet af kørslernes tidsmål; det er ikke percentiler af alle sager lagt sammen.",
    511,
    10,
    3,
  );
  text(319, 183, "BASELINE", 8, colors.muted, bold);
  text(446, 183, "ALTERNATIV", 8, colors.muted, bold);
  TIME_METRICS.forEach((metric, index) => {
    const a = aggregateTimeProfile(c.baselineRuns, metric),
      b = aggregateTimeProfile(c.scenarioRuns, metric),
      top = 210 + index * 156;
    text(42, top, TIME_LABELS[metric], 14, colors.ink, bold);
    const countRange = (value: typeof a) =>
      value.minCount === null
        ? "—"
        : value.minCount === value.maxCount
          ? String(value.minCount)
          : `${value.minCount}–${value.maxCount}`;
    const rows = [
      [
        "Gennemsnit pr. kørsel, middel",
        formatCaseTime(a.meanOfMeans),
        formatCaseTime(b.meanOfMeans),
      ],
      [
        "Median pr. kørsel, middel",
        formatCaseTime(a.meanOfMedians),
        formatCaseTime(b.meanOfMedians),
      ],
      [
        "P90 pr. kørsel, middel",
        formatCaseTime(a.meanOfP90),
        formatCaseTime(b.meanOfP90),
      ],
      ["Afsluttede sager pr. kørsel, min–maks", countRange(a), countRange(b)],
      [
        "Kørsler med tidsmåling",
        `${a.availableRuns} af ${a.runCount}`,
        `${b.availableRuns} af ${b.runCount}`,
      ],
    ];
    rows.forEach(([label, baseline, scenario], rowIndex) => {
      const rowY = top + 26 + rowIndex * 21;
      if (rowIndex % 2 === 0)
        rect(38, rowY - 14, 519, 20, rgb(0.97, 0.98, 0.97));
      text(46, rowY, label, 9, colors.ink, regular, 260);
      text(319, rowY, baseline, 10, colors.ink, regular, 114);
      text(446, rowY, scenario, 10, colors.teal, bold, 107);
    });
  });
  paragraph(
    42,
    676,
    "Tidsmålinger omfatter kun sager afsluttet i målevinduet. Kørsler uden afsluttede sager giver ingen tidsværdi og indgår ikke som nul i gennemsnittet. Antal sager er observationer pr. kørsel, ikke forskellige personer på tværs af seeds.",
    511,
    9,
    4,
  );
  paragraph(
    42,
    742,
    "P90 beregnes med lineær interpolation. Restkø og SLA vises særskilt. Alle præcise tidstal, antal observationer og seeds findes i time-summaries.csv og report.json.",
    511,
    9,
    3,
  );
  const longNames =
    bold.widthOfTextAtSize(report.title, 9) > 511 ||
    regular.widthOfTextAtSize(`Baseline vs. ${report.scenarioName}`, 9) > 511;
  if (
    hypothesisLines.length > 2 ||
    decisionLines.length > 4 ||
    longNames ||
    report.narrativeChanged
  ) {
    addPage();
    text(42, 99, "Bilag · dine fulde overvejelser", 20, colors.ink, bold);
    let lineY = 136;
    for (const [title, value] of [
      ...(longNames
        ? [
            ["Modelnavn", report.title],
            ["Alternativ", report.scenarioName],
          ]
        : []),
      ["Hypotese", report.hypothesis],
      ["Beslutning", report.decision],
      ...(report.narrativeChanged && report.runContext
        ? [
            [
              "Kørslens grundlag",
              `Startet ${report.runContext.startedAt}. Fælles seed: ${report.runContext.baseSeed}. Navn ved start: ${report.runContext.scenarioName}`,
            ],
            [
              "Hypotesen ved kørslens start",
              report.runContext.hypothesis || "Ingen hypotese angivet.",
            ],
          ]
        : []),
    ]) {
      if (lineY > 710) {
        addPage();
        lineY = 100;
      }
      text(42, lineY, title, 14, colors.ink, bold);
      lineY += 25;
      for (const line of wrap(value, 511, 10)) {
        if (lineY > 754) {
          addPage();
          lineY = 100;
        }
        text(42, lineY, line, 10);
        lineY += 16;
      }
      lineY += 23;
    }
  }
  if (report.diagnostics.length) {
    addPage();
    text(42, 99, "Bemærkninger fra motoren", 23, colors.ink, bold);
    let diagnosticY = 138;
    for (const diagnostic of report.diagnostics) {
      for (const line of wrap(diagnostic.message, 511, 11)) {
        if (diagnosticY > 744) {
          addPage();
          diagnosticY = 100;
        }
        text(42, diagnosticY, line, 11);
        diagnosticY += 18;
      }
      diagnosticY += 22;
    }
    if (diagnosticY > 650) {
      addPage();
      diagnosticY = 100;
    }
    paragraph(
      42,
      diagnosticY + 10,
      "En manglende måling vises som —. Baseline og alternativ kan have forskelligt antal tilgængelige kørsler; parrede forskelle bruger kun de kørsler, hvor begge værdier findes.",
      511,
      10,
      6,
    );
  }
  if (report.holdout) {
    const holdout = report.holdout;
    addPage();
    text(42, 99, "Holdout · kvalitetstjek", 24, colors.ink, bold);
    const status =
      holdout.status === "target_met"
        ? "Pilotmålet er nået for denne periode"
        : holdout.status === "outside_target"
          ? "Pilotmålet er ikke nået"
          : "Datagrundlaget er ikke tilstrækkeligt";
    text(42, 132, status, 13, colors.teal, bold);
    paragraph(
      42,
      157,
      report.holdoutMatchesBaseline
        ? "Vurderingen matcher rapportens baseline og motorversion."
        : "Historisk vurdering: modellen eller motorversionen matcher ikke rapportens baseline.",
      511,
      10,
      2,
    );
    text(42, 206, "MÅLING", 8, colors.muted, bold);
    text(235, 206, "OBSERVERET", 8, colors.muted, bold);
    text(345, 206, "BASELINE", 8, colors.muted, bold);
    text(455, 206, "AFVIGELSE", 8, colors.muted, bold);
    (["throughput", "leadTime", "queueTime", "backlog"] as const).forEach(
      (key, i) => {
        const metric = holdout.metrics[key],
          rowY = 237 + i * 36;
        if (i % 2 === 0) rect(38, rowY - 18, 519, 32, colors.pale);
        text(46, rowY, metricDefinitions[key].label, 10, colors.ink, bold);
        text(
          235,
          rowY,
          formatMetric(key, metric.observed),
          10,
          colors.ink,
          regular,
          100,
        );
        text(
          345,
          rowY,
          formatMetric(key, metric.simulated),
          10,
          colors.ink,
          regular,
          100,
        );
        text(
          455,
          rowY,
          metric.relativeError === null
            ? "Ikke vurderet"
            : `${(metric.relativeError * 100).toFixed(1).replace(".", ",")} %`,
          10,
          colors.ink,
          regular,
          98,
        );
      },
    );
    let holdoutY = 396;
    const period =
      holdout.source.unit === "iso"
        ? `${new Date(holdout.source.periodStart).toISOString()} til ${new Date(holdout.source.periodEnd).toISOString()}`
        : `${holdout.source.periodStart / 1000}–${holdout.source.periodEnd / 1000} sekunder`;
    const lines = [
      `Kilde: ${holdout.source.name}. ${holdout.source.rows} gyldige rækker; ${holdout.source.excludedRows} udeladt.`,
      `Periode: ${period}. Afsluttende aktivitet: ${holdout.source.completionActivity}.`,
      `SHA-256: ${holdout.source.sha256}`,
      `Modelversion ${holdout.model.revision}; ${holdout.seeds.length} seeds. Uafhængighed bekræftet: ${holdout.independent ? "ja" : "nej"}. Komplet periode bekræftet: ${holdout.completeWindow ? "ja" : "nej"}.`,
      ...holdout.dataGaps.map((gap) => `Datamangel: ${gap}`),
      ...holdout.notes,
    ];
    for (const value of lines) {
      for (const line of wrap(value, 511, 9)) {
        if (holdoutY > 750) {
          addPage();
          holdoutY = 100;
        }
        text(42, holdoutY, line, 9);
        holdoutY += 15;
      }
      holdoutY += 8;
    }
  }
  pages.forEach((p, i) => {
    page = p;
    text(
      42,
      811,
      `${c.engineVersion} · Lokal model · ${report.dataBasis === "synthetic" ? "Eksempeldata" : "Ikke kalibreret"}`,
      8,
      colors.muted,
    );
    text(512, 811, `${i + 1} / ${pages.length}`, 8, colors.muted);
  });
  return document.save();
}
