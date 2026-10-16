import { describe, expect, it } from "vitest";
import { CsvParser, parseCsv, parseTimestamp } from "./csv";
describe("CSV data contract", () => {
  it("FL-AT09 marks specific negative duration rows and excludes them", () => {
    const r = parseCsv("case_id,started_at,finished_at\na,10,5\nb,10,20", {
      unit: "seconds",
    });
    expect(r.excludedRows).toBe(1);
    expect(r.issues[0]).toMatchObject({ row: 2, field: "finished_at" });
    expect(r.durationMs).toEqual([10000]);
  });
  it("parses escaped quotes, multiline fields and CRLF across arbitrary chunk boundaries", () => {
    const rows: string[][] = [];
    const p = new CsvParser(",", (r) => rows.push(r));
    for (const c of 'a,b\r\n"x""y","first\nsecond"\r\n') p.write(c);
    p.finish();
    expect(rows).toEqual([
      ["a", "b"],
      ['x"y', "first\nsecond"],
    ]);
  });
  it("requires explicit timezone and rejects duplicate event ids", () => {
    const r = parseCsv(
      "case_id,event_id,started_at,finished_at\na,1,2026-10-16T09:00:00,2026-10-16T10:00:00Z\nb,1,2026-10-16T09:00:00Z,2026-10-16T10:00:00Z",
    );
    expect(r.excludedRows).toBe(2);
    expect(r.issues.map((i) => i.field)).toEqual(["started_at", "event_id"]);
  });
  it("supports explicit mapping, Danish semicolons and minute units", () => {
    const r = parseCsv("sag;start;slut\na;1,5;2,5", {
      mapping: { sag: "case_id", start: "started_at", slut: "finished_at" },
      unit: "minutes",
    });
    expect(r.durationMs).toEqual([60000]);
  });
  it("omits unmapped columns instead of silently retaining unnecessary data", () => {
    const r = parseCsv("case_id,started_at,name\na,0,Unnecessary", {
      unit: "seconds",
    });
    expect(r.rows[0]).toEqual({ case_id: "a", started_at: "0" });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("does not silently accept malformed CSV", () => {
    expect(() => parseCsv('case_id,started_at\n"broken,0')).toThrow(
      "uafsluttet",
    );
    expect(() => parseCsv("case_id,case_id\na,a")).toThrow("gentages");
  });
});

it("rejects impossible calendar dates instead of normalizing them silently", () => {
  const result = parseCsv(
    "case_id,started_at,finished_at\na,2026-02-30T09:00:00Z,2026-03-02T10:00:00Z",
  );
  expect(result.excludedRows).toBe(1);
  expect(result.issues[0].field).toBe("started_at");
});

it("detects delimiters outside quoted headers and rejects ambiguous mappings", () => {
  const r = parseCsv('"case;identifier",started_at,finished_at\na,0,1', {
    unit: "seconds",
    mapping: {
      "case;identifier": "case_id",
      started_at: "started_at",
      finished_at: "finished_at",
    },
  });
  expect(r.rows[0].case_id).toBe("a");
  expect(() =>
    parseCsv("one,two\na,b", { mapping: { one: "case_id", two: "case_id" } }),
  ).toThrow("samme felt");
  expect(() =>
    parseCsv("case_id,,finished_at\na,0,1", { unit: "seconds" }),
  ).toThrow("navn");
});
it("rejects finish before arrival without requiring a start and rejects unsafe relative timestamps", () => {
  const r = parseCsv(
    "case_id,arrived_at,finished_at\na,20,10\nb,0x10,20\nc,999999999999999999,20",
    { unit: "seconds" },
  );
  expect(r.excludedRows).toBe(3);
  expect(r.rows).toHaveLength(0);
});

it("does not treat inherited mapping properties as columns", () => {
  const result = parseCsv("case_id,toString,started_at\na,unneeded,0", {
    unit: "seconds",
    mapping: { case_id: "case_id", started_at: "started_at" },
  });
  expect(result.rows[0]).toEqual({ case_id: "a", started_at: "0" });
});

it("accepts a UTF-8 BOM before a quoted header across stream chunks", () => {
  const rows: string[][] = [];
  const parser = new CsvParser(",", (row) => rows.push(row));
  for (const chunk of ["", "\uFEFF", '"case_id",started_at\na,0'])
    parser.write(chunk);
  parser.finish();
  expect(rows).toEqual([
    ["case_id", "started_at"],
    ["a", "0"],
  ]);
});

it("rejects oversized and multiline identifiers without changing their contents", () => {
  const result = parseCsv(
    `case_id,activity,started_at\n${"a".repeat(101)},Step,0\nvalid,"two\nlines",0\nokay,Step,0`,
    { unit: "seconds" },
  );
  expect(result.excludedRows).toBe(2);
  expect(result.issues.map((issue) => issue.field)).toEqual([
    "case_id",
    "activity",
  ]);
  expect(result.rows).toEqual([
    { case_id: "okay", activity: "Step", started_at: "0" },
  ]);
});

it("rejects raw control characters before whitespace trimming in identities and times", () => {
  const result = parseCsv(
    'case_id,started_at,event_id\n"\tcase-a",0,a\ncase-b,"0\n",b\ncase-c,0,"\revent-c"\ncase-d,0,event-c\n"  case-e  ","  1  ",e',
    { unit: "seconds" },
  );
  expect(result.excludedRows).toBe(3);
  expect(result.issues.map(({ row, field }) => [row, field])).toEqual([
    [2, "case_id"],
    [3, "started_at"],
    [4, "event_id"],
  ]);
  expect(result.rows).toEqual([
    { case_id: "case-d", started_at: "0", event_id: "event-c" },
    { case_id: "case-e", started_at: "1", event_id: "e" },
  ]);
  expect(result.preview[0].case_id).toBe("\\u0009case-a");
  expect(result.preview[1].started_at).toBe("0\\u000a");
  expect(Number.isNaN(parseTimestamp("\t0", "seconds"))).toBe(true);
  expect(Number.isNaN(parseTimestamp("\n", "iso"))).toBe(true);
});

it("enforces the field bound on escaped quotes across chunks", () => {
  const accepted: string[][] = [],
    parser = new CsvParser(",", (row) => accepted.push(row));
  parser.write('"');
  parser.write('""'.repeat(100_000));
  parser.write('"');
  parser.finish();
  expect(accepted[0][0]).toBe('"'.repeat(100_000));
  const rejected = new CsvParser(",", () => {});
  rejected.write('"' + '""'.repeat(100_000));
  rejected.write('"');
  expect(() => rejected.write('"')).toThrow("for langt");
});

it("rejects oversized and control-bearing headers before normalization", () => {
  expect(() => parseCsv('"\tcase_id",started_at\na,0')).toThrow("kontroltegn");
  expect(() => parseCsv('"case_id\n",started_at\na,0')).toThrow("kontroltegn");
  expect(() => parseCsv(`${"h".repeat(201)},started_at\na,0`)).toThrow(
    "200 tegn",
  );
  expect(() =>
    parseCsv(`${Array.from({ length: 1001 }, (_, i) => `c${i}`).join(",")}\na`),
  ).toThrow("1.000 kolonner");
});

it("bounds displayed previews without truncating valid data or substituting invalid rows", () => {
  const time = "0".repeat(500) + "1";
  const result = parseCsv(
    `case_id,started_at\nvalid,${time}\n${"x".repeat(90000)},0`,
    { unit: "seconds" },
  );
  expect(result.rows).toEqual([{ case_id: "valid", started_at: time }]);
  expect(result.excludedRows).toBe(1);
  expect(result.preview).toHaveLength(2);
  expect(
    result.preview.every((row) =>
      Object.values(row).every((value) => value.length <= 240),
    ),
  ).toBe(true);
  expect(result.preview[0].started_at.endsWith("…")).toBe(true);
  expect(
    result.warnings.filter((warning) => warning.includes("240 tegn")),
  ).toHaveLength(1);
  expect(result.observedStart).toBe(1000);
});
