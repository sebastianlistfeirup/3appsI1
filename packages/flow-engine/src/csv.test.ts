import { describe, expect, it } from "vitest";
import { CsvParser, parseCsv } from "./csv";
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
