export const CSV_FIELDS = [
  "case_id",
  "case_type",
  "arrived_at",
  "activity",
  "started_at",
  "finished_at",
  "resource_group",
  "event_id",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export interface CsvMapping {
  [column: string]: CsvField | "";
}
export interface CsvRow {
  [field: string]: string;
}
export interface CsvIssue {
  row: number;
  field: string;
  message: string;
}
export interface CsvImport {
  headers: string[];
  preview: CsvRow[];
  rows: CsvRow[];
  rowCount: number;
  excludedRows: number;
  issues: CsvIssue[];
  issueCount: number;
  warnings: string[];
  durationMs: number[];
  observedStart: number | null;
  observedEnd: number | null;
}
export class CsvParser {
  private current = "";
  private firstCharacter = true;
  private row: string[] = [];
  private quoted = false;
  private quotePending = false;
  private started = false;
  private afterQuote = false;
  private skipLf = false;
  constructor(
    private delimiter = ",",
    private onRow: (row: string[]) => void,
  ) {}
  write(chunk: string) {
    for (const char of chunk) {
      if (this.firstCharacter) {
        this.firstCharacter = false;
        if (char === "\uFEFF") continue;
      }
      if (this.skipLf) {
        this.skipLf = false;
        if (char === "\n") continue;
      }
      if (this.quoted) {
        if (this.quotePending) {
          this.quotePending = false;
          if (char === '"') {
            this.current += '"';
            continue;
          }
          this.quoted = false;
          this.afterQuote = true;
        } else {
          if (char === '"') this.quotePending = true;
          else this.current += char;
          if (this.current.length > 100_000)
            throw new Error("Et CSV-felt er for langt.");
          continue;
        }
      }
      if (char === this.delimiter) {
        this.row.push(this.current);
        this.current = "";
        this.started = false;
        this.afterQuote = false;
      } else if (char === "\r" || char === "\n") {
        this.row.push(this.current);
        this.onRow(this.row);
        this.row = [];
        this.current = "";
        this.started = false;
        this.afterQuote = false;
        if (char === "\r") this.skipLf = true;
      } else if (char === '"' && !this.started && !this.afterQuote) {
        this.quoted = true;
        this.started = true;
      } else if (this.afterQuote) {
        if (char !== " " && char !== "\t")
          throw new Error("Uventet tekst efter et afsluttet CSV-felt.");
      } else {
        if (char === '"')
          throw new Error("Anførselstegn skal omslutte hele CSV-feltet.");
        this.current += char;
        this.started = true;
      }
      if (this.current.length > 100_000)
        throw new Error("Et CSV-felt er for langt.");
    }
  }
  finish() {
    if (this.quoted && !this.quotePending)
      throw new Error("CSV-filen har et uafsluttet anførselstegn.");
    if (this.current || this.row.length || this.started)
      this.onRow([...this.row, this.current]);
  }
}
export function inferDelimiter(text: string): string {
  let quoted = false,
    comma = 0,
    semicolon = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    } else if (!quoted) {
      if (char === "\r" || char === "\n") break;
      if (char === ",") comma++;
      if (char === ";") semicolon++;
    }
  }
  return semicolon > comma ? ";" : ",";
}
export function parseTimestamp(
  value: string,
  unit: "iso" | "seconds" | "minutes",
): number | null {
  if (!value.trim()) return null;
  if (unit !== "iso") {
    if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return NaN;
    const n = Number(value.replace(",", ".")),
      ms = Math.round(n * (unit === "seconds" ? 1000 : 60000));
    return Number.isSafeInteger(ms) && ms >= 0 ? ms : NaN;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return NaN;
  const dateParts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)!;
  const [year, month, day, hour, minute, second] = dateParts
    .slice(1)
    .map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    (second || 0) > 59
  )
    return NaN;
  return Date.parse(value);
}
export function createCsvImporter(options: {
  mapping?: CsvMapping;
  unit?: "iso" | "seconds" | "minutes";
  delimiter?: string;
}) {
  const fields = Object.values(options.mapping ?? {}).filter(Boolean);
  if (fields.some((field) => !CSV_FIELDS.includes(field as CsvField)))
    throw new Error("Kolonnemappingen indeholder et ukendt felt.");
  if (new Set(fields).size !== fields.length)
    throw new Error("To kolonner må ikke mappes til samme felt.");
  const result: CsvImport = {
      headers: [],
      preview: [],
      rows: [],
      rowCount: 0,
      excludedRows: 0,
      issues: [],
      issueCount: 0,
      warnings: [],
      durationMs: [],
      observedStart: null,
      observedEnd: null,
    },
    eventIds = new Set<string>();
  let line = 0;
  const parser = new CsvParser(options.delimiter ?? ",", (cells) => {
    line++;
    if (line === 1) {
      result.headers = cells.map((c) => c.replace(/^\uFEFF/, "").trim());
      if (result.headers.length > 1000)
        throw new Error("CSV-grænsen er 1.000 kolonner.");
      if (result.headers.some((header) => !header))
        throw new Error("Alle kolonner skal have et navn.");
      if (new Set(result.headers).size !== result.headers.length)
        throw new Error("Kolonnenavne må ikke gentages.");
      return;
    }
    if (cells.every((c) => !c.trim())) return;
    result.rowCount++;
    if (result.rowCount > 100000)
      throw new Error("CSV-grænsen er 100.000 rækker.");
    const row: CsvRow = {},
      issues: CsvIssue[] = [];
    const issue = (field: string, message: string) =>
      issues.push({ row: line, field, message });
    if (cells.length !== result.headers.length)
      issue(
        "row",
        `Forventede ${result.headers.length} felter; fandt ${cells.length}.`,
      );
    result.headers.forEach((header, i) => {
      const field = options.mapping
        ? Object.hasOwn(options.mapping, header)
          ? options.mapping[header]
          : ""
        : CSV_FIELDS.includes(header as CsvField)
          ? header
          : "";
      if (field) row[field] = (cells[i] ?? "").trim();
    });
    if (result.preview.length < 6) result.preview.push(row);
    if (!Object.keys(row).length)
      issue(
        "mapping",
        "Ingen kendte kolonner. Map mindst case_id og et tidsfelt.",
      );
    if (!row.case_id)
      issue("case_id", "Sags-id mangler; rækken kan ikke knyttes til en sag.");
    for (const field of [
      "case_id",
      "case_type",
      "activity",
      "resource_group",
      "event_id",
    ]) {
      const value = row[field];
      if (value && (value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)))
        issue(
          field,
          "Id og navne må højst være 100 tegn og må ikke indeholde linjeskift eller kontroltegn.",
        );
    }
    const times: Record<string, number | null> = {};
    for (const field of ["arrived_at", "started_at", "finished_at"]) {
      times[field] = parseTimestamp(row[field] ?? "", options.unit ?? "iso");
      if (Number.isNaN(times[field]))
        issue(
          field,
          options.unit === "iso" || !options.unit
            ? "Ugyldig ISO-dato. Angiv tidszone, fx 2026-10-16T09:00:00+02:00."
            : "Tiden skal være et ikke-negativt tal.",
        );
    }
    if (Object.values(times).every((t) => t === null))
      issue("time", "Mindst ét tidsfelt skal være udfyldt.");
    if (
      times.finished_at !== null &&
      times.started_at !== null &&
      times.finished_at < times.started_at
    )
      issue("finished_at", "Afslutning ligger før start (negativ varighed).");
    if (
      times.started_at !== null &&
      times.arrived_at !== null &&
      times.started_at < times.arrived_at
    )
      issue("started_at", "Start ligger før ankomst.");
    if (
      times.finished_at !== null &&
      times.arrived_at !== null &&
      times.finished_at < times.arrived_at
    )
      issue("finished_at", "Afslutning ligger før ankomst.");
    if (row.event_id) {
      if (eventIds.has(row.event_id))
        issue("event_id", "Dubleret hændelses-id.");
      eventIds.add(row.event_id);
    }
    if (issues.length) {
      result.excludedRows++;
      result.issueCount += issues.length;
      result.issues.push(
        ...issues.slice(0, Math.max(0, 1000 - result.issues.length)),
      );
    } else {
      result.rows.push(row);
      if (times.finished_at !== null && times.started_at !== null)
        result.durationMs.push(times.finished_at - times.started_at);
      for (const t of Object.values(times))
        if (t !== null) {
          result.observedStart = Math.min(result.observedStart ?? t, t);
          result.observedEnd = Math.max(result.observedEnd ?? t, t);
        }
    }
  });
  return {
    write: (chunk: string) => parser.write(chunk),
    finish: () => {
      parser.finish();
      if (!result.headers.length) throw new Error("CSV-filen er tom.");
      if (
        result.headers.some((h) => !CSV_FIELDS.includes(h as CsvField)) &&
        !options.mapping
      )
        result.warnings.push(
          "Ukendte kolonner er udeladt. Ingen navne, e-mails eller fritekst er nødvendige.",
        );
      if (result.rows.some((r) => !r.started_at || !r.finished_at))
        result.warnings.push(
          "Nogle rækker mangler start eller afslutning; de indgår ikke i varighedsfordelingen. Intet er imputeret.",
        );
      return result;
    },
  };
}
export function parseCsv(
  text: string,
  options: Parameters<typeof createCsvImporter>[0] = {},
): CsvImport {
  if (new TextEncoder().encode(text).byteLength > 10 * 1024 * 1024)
    throw new Error("CSV-grænsen er 10 MB.");
  const importer = createCsvImporter({
    ...options,
    delimiter: options.delimiter ?? inferDelimiter(text),
  });
  importer.write(text);
  return importer.finish();
}
export function cleanedCsv(result: CsvImport): string {
  const headers = CSV_FIELDS.filter((h) => result.rows.some((r) => h in r));
  const escape = (v: string) =>
    `"${(/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...result.rows.map((row) =>
      headers.map((h) => escape(row[h] ?? "")).join(","),
    ),
  ].join("\n");
}
