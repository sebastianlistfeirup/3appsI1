import { describe, expect, it } from "vitest";
import {
  compareText,
  comparisonInput,
  contextRows,
  type TextComparison,
} from "./comparison";
import { createSample } from "./sample";

function exact(result: TextComparison, before: string, after: string) {
  expect(result.kind).toBe("diff");
  if (result.kind !== "diff") throw new Error("Expected bounded diff");
  expect(
    result.rows
      .filter((line) => line.type !== "added")
      .map((line) => line.raw)
      .join(""),
  ).toBe(before);
  expect(
    result.rows
      .filter((line) => line.type !== "removed")
      .map((line) => line.raw)
      .join(""),
  ).toBe(after);
  expect(result.rows.flatMap((line) => line.before ?? [])).toEqual(
    Array.from(
      { length: result.rows.filter((line) => line.type !== "added").length },
      (_, i) => i + 1,
    ),
  );
  expect(result.rows.flatMap((line) => line.after ?? [])).toEqual(
    Array.from(
      { length: result.rows.filter((line) => line.type !== "removed").length },
      (_, i) => i + 1,
    ),
  );
  return result;
}
describe("review comparisons use evidence instead of mutable current files", () => {
  it("chooses the run's precise input, even after an intervening file upload", () => {
    const p = createSample().projects[0]!,
      delivery = p.deliveries[0]!,
      old = p.artifacts.find((a) => a.id === "menu-v1")!,
      output = p.artifacts.find((a) => a.id === "menu-v2")!;
    output.version = 3;
    p.artifacts.push({
      ...old,
      id: "intervening-v2",
      version: 2,
      content: "Uploaded after the run started",
    });
    expect(comparisonInput(p, delivery, output)?.id).toBe("menu-v1");
    expect(
      comparisonInput(
        p,
        delivery,
        p.artifacts.find((a) => a.id === "notes-v1")!,
      ),
    ).toBeUndefined();
  });
  it("keeps unchanged lines between separated edits and preserves exact line numbers", () => {
    const before = "før\nændr A\nfælles 🌙\nændr B\nefter\n",
      after = "før\nny A\nfælles 🌙\nny B\nefter\n";
    const result = exact(compareText(before, after), before, after);
    expect(result.added).toBe(2);
    expect(result.removed).toBe(2);
    expect(result.rows.find((r) => r.text === "fælles 🌙")).toMatchObject({
      type: "same",
      before: 3,
      after: 3,
    });
    expect(result.coarse).toBe(false);
  });
  it("does not normalize CRLF, EOF newlines, blank lines, BOM or adjacent HTML tags", () => {
    for (const [before, after] of [
      ["a\r\nb\r", "a\nb\n"],
      ["a", "a\n"],
      ["", "\n"],
      ["\uFEFF<h1>A</h1><p>B</p>", "<h1>A</h1><p>B</p>"],
      ["", ""],
      ["\n\n", "\n"],
    ]) {
      const result = exact(compareText(before!, after!), before!, after!);
      expect(result.identical).toBe(before === after);
      if (before !== after)
        expect(result.added + result.removed).toBeGreaterThan(0);
    }
    const eol = compareText("a\r\n", "a\n");
    if (eol.kind === "diff")
      expect(eol.rows.map((r) => r.ending)).toEqual(["CRLF", "LF"]);
  });
  it("finds distant anchors in a long file without treating the middle as changed", () => {
    const a = Array.from({ length: 2000 }, (_, i) => `Unchanged line ${i}\n`),
      b = [...a];
    b[1] = "Changed near the beginning\n";
    b[1998] = "Changed near the end\n";
    const result = exact(
      compareText(a.join(""), b.join("")),
      a.join(""),
      b.join(""),
    );
    expect(result.added).toBe(2);
    expect(result.removed).toBe(2);
    expect(result.coarse).toBe(false);
    const compact = contextRows(result.rows);
    expect(compact.length).toBeLessThan(20);
    expect(compact.some((r) => r.type === "gap" && r.count > 1900)).toBe(true);
  });
  it("bounds expensive ambiguous blocks and rejects large inputs before splitting", () => {
    const before = "A\n".repeat(2000),
      after = "B\n".repeat(2000);
    expect(exact(compareText(before, after), before, after).coarse).toBe(true);
    expect(compareText("x".repeat(300001), "").kind).toBe("too_large");
    expect(compareText("x\n".repeat(5001), "").kind).toBe("too_large");
  });
  it("losslessly reconstructs both inputs over 200 deterministic repeated-line edit cases", () => {
    let seed = 2405;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const tokens = [
      "same\n",
      "same\r\n",
      "other\n",
      "\n",
      "æ 🌙\n",
      "<b></b>\n",
    ];
    for (let n = 0; n < 200; n++) {
      const a = Array.from(
        { length: random() % 40 },
        () => tokens[random() % tokens.length]!,
      ).join("");
      const b = Array.from(
        { length: random() % 40 },
        () => tokens[random() % tokens.length]!,
      ).join("");
      exact(compareText(a, b), a, b);
    }
  });
});
