import {
  assertReportReady,
  metricDefinitions,
  type Comparison,
  type MetricKey,
} from "@tre/flow-engine";
import { strToU8, zipSync } from "fflate";
import { formatMetric, formatDifference, type FlowDocument } from "./document";
export interface DecisionReport {
  reportVersion: 1;
  generatedAt: string;
  title: string;
  scenarioName: string;
  hypothesis: string;
  decision: string;
  dataBasis: string;
  limitations: string[];
  comparison: Comparison;
}
export function createReport(doc: FlowDocument): DecisionReport {
  if (!doc.comparison) throw new Error("Kør en sammenligning først.");
  assertReportReady(doc.comparison);
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    title: doc.comparison.baseline.name,
    scenarioName: doc.scenarioName,
    hypothesis: doc.hypothesis,
    decision: doc.decision,
    dataBasis: doc.comparison.baseline.evidence,
    limitations: [
      "Resultaterne er simulerede og er ikke dokumentation for realiserede gevinster.",
      "10.–90.-percentilen er simulationsspredning for parrede forskelle, ikke et konfidensinterval for virkeligheden.",
      "Gennemløbs- og ventetider omfatter kun afsluttede sager. Restkøen vises særskilt.",
      "Modellen er ikke automatisk kalibreret mod faktisk drift. Ingen kundedata eller cloudintegration er tilkoblet.",
    ],
    comparison: doc.comparison,
  };
}
const pdfEscape = (s: string) =>
  s
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[\r\n]/g, " ");
function latin1(text: string) {
  const replacements: Record<string, number> = {
    "–": 150,
    "—": 151,
    "’": 146,
    "“": 147,
    "”": 148,
    "•": 149,
    "€": 128,
    "…": 133,
  };
  return Uint8Array.from(
    Array.from(
      text,
      (c) => replacements[c] ?? (c.charCodeAt(0) <= 255 ? c.charCodeAt(0) : 63),
    ),
  );
}
/** A self-contained two-page PDF using standard PDF fonts. Text and metrics derive from the same report object as JSON. */
export function reportPdf(report: DecisionReport): Uint8Array {
  const pages: string[] = [];
  const shortened = (s: string, max: number) =>
    s.length <= max
      ? s
      : `${s.slice(0, max - 42)}… (Fuld tekst i bilag og JSON-pakke.)`;
  const appendix =
    report.hypothesis.length > 160 || report.decision.length > 460;
  let operations: string[] = [];
  const color = (value: string) => {
    const h = value.replace("#", "");
    return [0, 2, 4]
      .map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3))
      .join(" ");
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    operations.push(`${color(fill)} rg ${x} ${842 - y - h} ${w} ${h} re f`);
  const text = (
    x: number,
    y: number,
    value: string,
    size = 10,
    fill = "#17343a",
    bold = false,
  ) =>
    operations.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${color(fill)} rg 1 0 0 1 ${x} ${842 - y} Tm (${pdfEscape(value)}) Tj ET`,
    );
  const paragraph = (
    x: number,
    y: number,
    value: string,
    width = 87,
    size = 10,
  ) => {
    let line = "",
      offset = 0;
    for (const word of value.split(/\s+/)) {
      if ((line + word).length > width) {
        text(x, y + offset, line, size);
        offset += size * 1.5;
        line = "";
      }
      line += `${word} `;
    }
    if (line) {
      text(x, y + offset, line, size);
      offset += size * 1.5;
    }
    return y + offset;
  };
  const header = (page: number) => {
    rect(0, 0, 595, 842, "#ffffff");
    rect(0, 0, 595, 8, "#007e83");
    text(42, 48, "FLOWLAB", 16, "#007e83", true);
    text(393, 46, "BESLUTNINGSRAPPORT", 9, "#647975");
    text(
      42,
      808,
      `${report.comparison.engineVersion} · Eksempel / lokal model`,
      8,
      "#647975",
    );
    text(514, 808, `${page} / TOTALPAGES`, 8, "#647975");
  };
  const c = report.comparison;
  header(1);
  text(42, 99, report.title, 27, "#17343a", true);
  text(42, 124, `Baseline vs. ${report.scenarioName}`, 11, "#647975");
  text(
    42,
    146,
    `${c.seeds.length} parrede replikationer · ${c.baseline.horizon / 3600000} timer · ${report.generatedAt.slice(0, 10)}`,
    10,
    "#647975",
  );
  rect(42, 168, 511, 64, "#eef5ef");
  text(57, 190, "HYPOTESE", 8, "#007e83", true);
  paragraph(
    57,
    209,
    shortened(report.hypothesis || "Ingen hypotese angivet.", 160),
    85,
    10,
  );
  text(42, 262, "Resultat af sammenligningen", 16, "#17343a", true);
  text(
    42,
    282,
    "Middelværdi på tværs af kørsler. Gennemløbstid: middel af run-medianer.",
    9,
    "#647975",
  );
  const widths = [42, 220, 325, 431];
  ["MÅLING", "BASELINE", "ALTERNATIV", "FORSKEL"].forEach((v, i) =>
    text(widths[i], 312, v, 8, "#647975", true),
  );
  c.metrics.forEach((m, i) => {
    const y = 338 + i * 36;
    if (i % 2 === 0) rect(38, y - 17, 519, 32, "#f7f9f8");
    text(46, y, metricDefinitions[m.key].label, 10, "#17343a", true);
    text(220, y, formatMetric(m.key, m.baseline), 10);
    text(325, y, formatMetric(m.key, m.scenario), 10, "#007e83", true);
    text(
      431,
      y,
      `${m.deltaMean !== null && m.deltaMean > 0 ? "+" : ""}${formatDifference(m.key, m.deltaMean).replace(" procentpoint", " pp")}`,
      10,
    );
  });
  text(42, 622, "Din beslutning", 16, "#17343a", true);
  paragraph(
    42,
    644,
    shortened(
      report.decision ||
        "Ingen beslutning tilføjet. Vurder antagelser, restkø og spredning, før du beslutter en ændring.",
      460,
    ),
    90,
    10,
  );
  paragraph(42, 741, report.limitations[0], 95, 9);
  pages.push(operations.join("\n"));
  operations = [];
  header(2);
  text(42, 99, "Antagelser & usikkerhed", 24, "#17343a", true);
  text(
    42,
    132,
    "10.–90.-percentil af alternativ minus baseline",
    11,
    "#647975",
  );
  c.metrics.forEach((m, i) => {
    text(42, 164 + i * 25, metricDefinitions[m.key].label, 10, "#17343a", true);
    text(
      240,
      164 + i * 25,
      `${formatDifference(m.key, m.deltaP10).replace(" procentpoint", " pp")} til ${formatDifference(m.key, m.deltaP90).replace(" procentpoint", " pp")} (${m.pairs} par)`,
      10,
    );
  });
  text(42, 369, "Ændrede input", 16, "#17343a", true);
  let y = 391;
  for (const d of c.differences.slice(0, 4))
    y = paragraph(
      42,
      y,
      shortened(
        `${d.path}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`,
        130,
      ),
      90,
      9,
    );
  if (c.differences.length > 4)
    text(
      42,
      y + 3,
      `+ ${c.differences.length - 4} ændringer. Fuld inputdiff findes i report.json.`,
      9,
    );
  y = Math.max(y + 22, 476);
  text(42, y, "Læs tallene med omtanke", 16, "#17343a", true);
  y += 22;
  for (const limit of report.limitations)
    y = paragraph(42, y, `• ${limit}`, 93, 9) + 5;
  y += 12;
  text(42, y, "Reproducerbarhed", 13, "#17343a", true);
  paragraph(
    42,
    y + 20,
    `Motor: ${c.engineVersion}. Modelversion: ${c.baseline.revision}. Målevindue: ${c.baseline.observationStart}–${c.baseline.horizon} ms. Fuld model, samtlige seeds, run-metrics, køkurver og inputdiff findes i JSON-pakken.`,
    95,
    9,
  );
  pages.push(operations.join("\n"));
  if (appendix) {
    operations = [];
    header(3);
    text(42, 99, "Bilag · dine fulde overvejelser", 20, "#17343a", true);
    let lineY = 135;
    for (const section of [
      ["Hypotese", report.hypothesis],
      ["Beslutning", report.decision],
    ]) {
      if (lineY > 730) {
        pages.push(operations.join("\n"));
        operations = [];
        header(pages.length + 1);
        lineY = 100;
      }
      text(42, lineY, section[0], 14, "#17343a", true);
      lineY += 24;
      const words = section[1].split(/\s+/);
      let line = "";
      const emit = () => {
        if (lineY > 750) {
          pages.push(operations.join("\n"));
          operations = [];
          header(pages.length + 1);
          lineY = 100;
        }
        text(42, lineY, line, 10);
        lineY += 16;
        line = "";
      };
      for (const word of words) {
        if ((line + word).length > 85) emit();
        line += `${word} `;
      }
      if (line) emit();
      lineY += 24;
    }
    pages.push(operations.join("\n"));
  }
  for (let i = 0; i < pages.length; i++)
    pages[i] = pages[i].replaceAll("TOTALPAGES", String(pages.length));
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  for (let i = 0; i < pages.length; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${latin1(pages[i]).length} >>\nstream\n${pages[i]}\nendstream`,
    );
  }
  let output = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(latin1(output).length);
    output += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = latin1(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return latin1(output);
}
export function reportZip(report: DecisionReport): Uint8Array {
  const metrics = [
    "metric,baseline,scenario,delta_mean,delta_p10,delta_p90,pairs",
    ...report.comparison.metrics.map((m) =>
      [
        m.key,
        m.baseline,
        m.scenario,
        m.deltaMean,
        m.deltaP10,
        m.deltaP90,
        m.pairs,
      ].join(","),
    ),
  ].join("\n");
  return zipSync(
    {
      "rapport.pdf": reportPdf(report),
      "report.json": strToU8(JSON.stringify(report, null, 2)),
      "metrics.csv": strToU8(metrics),
      "models.json": strToU8(
        JSON.stringify(
          {
            baseline: report.comparison.baseline,
            scenario: report.comparison.scenario,
          },
          null,
          2,
        ),
      ),
      "LAES_MIG.txt": strToU8(
        "FlowLab lokal beslutningsrapport\nPDF og CSV er afledt af de samme metrics i report.json.\nFor at reproducere: brug motorversionen, de to model-snapshots og den fælles seedliste i report.json.\nAlle tider i JSON er millisekunder; rapporten viser minutter.\nSimulerede gevinster er ikke realiserede gevinster.\n",
      ),
    },
    { level: 6 },
  );
}
