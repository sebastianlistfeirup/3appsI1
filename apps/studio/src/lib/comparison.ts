import type { Artifact, Delivery, Project } from "./model";

/** A review compares the exact run input. A newer file uploaded while that run
 * was open is not its baseline, even when it immediately precedes the output. */
export function comparisonInput(
  project: Project,
  delivery: Delivery,
  output: Artifact,
): Artifact | undefined {
  const run = project.runs.find((candidate) => candidate.id === delivery.runId);
  if (!run) return undefined;
  return project.artifacts
    .filter(
      (artifact) =>
        artifact.artifactId === output.artifactId &&
        run.inputVersionIds.includes(artifact.id),
    )
    .sort((left, right) => right.version - left.version)[0];
}

export type DiffLine = {
  type: "same" | "added" | "removed";
  /** The original line including its exact newline, so the diff is lossless. */
  raw: string;
  text: string;
  ending: "LF" | "CRLF" | "CR" | "none";
  before: number | null;
  after: number | null;
};
export type TextComparison =
  | { kind: "too_large"; reason: string }
  | {
      kind: "diff";
      rows: DiffLine[];
      added: number;
      removed: number;
      coarse: boolean;
      identical: boolean;
    };
const MAX_CHARACTERS = 300_000;
const MAX_LINES = 5_000;
const MAX_CELLS = 2_000_000;

function lines(text: string) {
  if (!text) return [];
  const result = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)!;
  if (result.at(-1) === "") result.pop();
  return result;
}

/** Patience anchors preserve distant unchanged sections without allocating an
 * unbounded quadratic table. Small gaps use LCS; ambiguous expensive gaps are
 * explicitly marked coarse. Work, input size and rendered row count are bounded. */
export function compareText(before: string, after: string): TextComparison {
  if (before.length + after.length > MAX_CHARACTERS)
    return {
      kind: "too_large",
      reason:
        "Filerne er for store til kodediff her. Hent begge versioner for at sammenligne hele indholdet i din editor.",
    };
  const left = lines(before),
    right = lines(after);
  if (left.length > MAX_LINES || right.length > MAX_LINES)
    return {
      kind: "too_large",
      reason:
        "En fil har over 5.000 linjer. Hent begge versioner for at sammenligne hele indholdet i din editor.",
    };
  const edits: { type: DiffLine["type"]; raw: string }[] = [];
  let remainingCells = MAX_CELLS,
    coarse = false;
  function append(
    type: DiffLine["type"],
    source: string[],
    start: number,
    end: number,
  ) {
    for (let index = start; index < end; index++)
      edits.push({ type, raw: source[index]! });
  }
  function anchors(a0: number, a1: number, b0: number, b1: number) {
    const a = new Map<string, number>(),
      b = new Map<string, number>();
    for (let i = a0; i < a1; i++) a.set(left[i]!, a.has(left[i]!) ? -1 : i);
    for (let i = b0; i < b1; i++) b.set(right[i]!, b.has(right[i]!) ? -1 : i);
    const candidates: [number, number][] = [];
    for (const [line, index] of a) {
      const matching = b.get(line);
      if (index >= 0 && matching !== undefined && matching >= 0)
        candidates.push([index, matching]);
    }
    // Map insertion order is the left-hand line order. Find the longest increasing
    // right-hand subsequence; crossing anchors would reorder unchanged content.
    const tails: number[] = [],
      previous = new Int32Array(candidates.length).fill(-1);
    for (let i = 0; i < candidates.length; i++) {
      let lo = 0,
        hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (candidates[tails[mid]!]![1] < candidates[i]![1]) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) previous[i] = tails[lo - 1]!;
      tails[lo] = i;
    }
    const ordered: [number, number][] = [];
    let cursor = tails.at(-1) ?? -1;
    while (cursor >= 0) {
      ordered.push(candidates[cursor]!);
      cursor = previous[cursor]!;
    }
    return ordered.reverse();
  }
  function gap(a0: number, a1: number, b0: number, b1: number, depth = 0) {
    while (a0 < a1 && b0 < b1 && left[a0] === right[b0]) {
      append("same", left, a0, ++a0);
      b0++;
    }
    let suffix = 0;
    while (a1 > a0 && b1 > b0 && left[a1 - 1] === right[b1 - 1]) {
      a1--;
      b1--;
      suffix++;
    }
    const n = a1 - a0,
      m = b1 - b0,
      cells = (n + 1) * (m + 1);
    if (n === 0) append("added", right, b0, b1);
    else if (m === 0) append("removed", left, a0, a1);
    else if (cells <= Math.min(remainingCells, 250_000)) {
      remainingCells -= cells;
      const width = m + 1,
        table = new Uint16Array(cells);
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          table[i * width + j] =
            left[a0 + i] === right[b0 + j]
              ? table[(i + 1) * width + j + 1]! + 1
              : Math.max(
                  table[(i + 1) * width + j]!,
                  table[i * width + j + 1]!,
                );
      let i = 0,
        j = 0;
      while (i < n && j < m) {
        if (left[a0 + i] === right[b0 + j]) {
          edits.push({ type: "same", raw: left[a0 + i++]! });
          j++;
        } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!)
          edits.push({ type: "removed", raw: left[a0 + i++]! });
        else edits.push({ type: "added", raw: right[b0 + j++]! });
      }
      append("removed", left, a0 + i, a1);
      append("added", right, b0 + j, b1);
    } else {
      const common = depth < 32 ? anchors(a0, a1, b0, b1) : [];
      if (!common.length) {
        coarse = true;
        append("removed", left, a0, a1);
        append("added", right, b0, b1);
      } else {
        let a = a0,
          b = b0;
        for (const [x, y] of common) {
          gap(a, x, b, y, depth + 1);
          edits.push({ type: "same", raw: left[x]! });
          a = x + 1;
          b = y + 1;
        }
        gap(a, a1, b, b1, depth + 1);
      }
    }
    append("same", left, a1, a1 + suffix);
  }
  gap(0, left.length, 0, right.length);
  let oldLine = 0,
    newLine = 0,
    added = 0,
    removed = 0;
  const rows = edits.map(({ type, raw }): DiffLine => {
    if (type === "added") added++;
    if (type === "removed") removed++;
    const ending = raw.endsWith("\r\n")
      ? "CRLF"
      : raw.endsWith("\n")
        ? "LF"
        : raw.endsWith("\r")
          ? "CR"
          : "none";
    return {
      type,
      raw,
      text: raw.replace(/(?:\r\n|\r|\n)$/, ""),
      ending,
      before: type === "added" ? null : ++oldLine,
      after: type === "removed" ? null : ++newLine,
    };
  });
  return {
    kind: "diff",
    rows,
    added,
    removed,
    coarse,
    identical: before === after,
  };
}

export type VisibleDiffRow =
  DiffLine | { type: "gap"; count: number; start: number };
export function contextRows(rows: DiffLine[], context = 3): VisibleDiffRow[] {
  const keep = new Set<number>();
  rows.forEach((row, index) => {
    if (row.type !== "same")
      for (
        let i = Math.max(0, index - context);
        i <= Math.min(rows.length - 1, index + context);
        i++
      )
        keep.add(i);
  });
  const result: VisibleDiffRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    if (keep.has(index)) result.push(rows[index]!);
    else {
      const start = index;
      while (index + 1 < rows.length && !keep.has(index + 1)) index++;
      result.push({ type: "gap", start, count: index - start + 1 });
    }
  }
  return result;
}
