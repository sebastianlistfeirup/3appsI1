"use client";
import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, GitBranch, Play } from "lucide-react";
import type { FlowModel, InputDifference } from "@tre/flow-engine";
import { downloadFile } from "@tre/persistence";
import { DIFF_PAGE_SIZE, differenceRows } from "../lib/input-differences";

export default function InputDifferences({
  differences,
  baseline,
  scenario,
  running,
  onRun,
}: {
  differences: InputDifference[];
  baseline: FlowModel;
  scenario: FlowModel;
  running: boolean;
  onRun: () => void;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const rows = useMemo(
      () => differenceRows(differences, baseline),
      [differences, baseline],
    ),
    filtered = useMemo(() => {
      const search = query.trim().toLocaleLowerCase("da-DK");
      return search
        ? rows.filter((row) =>
            `${row.path} ${row.label} ${row.before} ${row.after}`
              .toLocaleLowerCase("da-DK")
              .includes(search),
          )
        : rows;
    }, [rows, query]),
    pages = Math.max(1, Math.ceil(filtered.length / DIFF_PAGE_SIZE)),
    current = Math.min(page, pages - 1),
    shown = filtered.slice(
      current * DIFF_PAGE_SIZE,
      (current + 1) * DIFF_PAGE_SIZE,
    );
  return (
    <section
      className="panel input-differences"
      aria-labelledby="input-differences-title"
    >
      <div className="section-title">
        <h3 id="input-differences-title">Præcis dét er ændret</h3>
        <span className="small-badge">
          {differences.length.toLocaleString("da-DK")} input
        </span>
      </div>
      {differences.length ? (
        <>
          <label>
            Find inputændring
            <input
              type="search"
              maxLength={100}
              placeholder="Felt, sti eller vist værdi"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <p className="field-hint">
            {filtered.length.toLocaleString("da-DK")} match af{" "}
            {differences.length.toLocaleString("da-DK")} ændringer. Højst{" "}
            {DIFF_PAGE_SIZE} vises ad gangen. Lister sammenlignes efter
            position.
          </p>
          <div className="diff-list" role="list" aria-label="Inputændringer">
            {shown.map((row) => (
              <div className="input-diff-row" key={row.path} role="listitem">
                <h4>{row.label}</h4>
                <code>{row.path}</code>
                <div className="diff-values">
                  <div>
                    <small>Baseline</small>
                    <b>{row.before}</b>
                  </div>
                  <ArrowRight size={14} aria-hidden="true" />
                  <div>
                    <small>Alternativ</small>
                    <b>{row.after}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!shown.length && (
            <p className="notice-text">
              Ingen inputændringer matcher søgningen. De øvrige ændringer er
              bevaret.
            </p>
          )}
          {pages > 1 && (
            <div className="diff-pagination">
              <button
                className="button subtle"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Forrige inputændringer"
              >
                Forrige
              </button>
              <label>
                Side
                <input
                  type="number"
                  min={1}
                  max={pages}
                  step={1}
                  aria-label="Side med inputændringer"
                  value={current + 1}
                  onChange={(event) =>
                    setPage(
                      Math.max(
                        0,
                        Math.min(
                          pages - 1,
                          Math.round(Number(event.target.value)) - 1,
                        ),
                      ),
                    )
                  }
                />
                <span>af {pages.toLocaleString("da-DK")}</span>
              </label>
              <button
                className="button subtle"
                disabled={current === pages - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Næste inputændringer"
              >
                Næste
              </button>
            </div>
          )}
          <p className="field-hint">
            Lange tekster og samlede objekter har en kort forhåndsvisning. JSON
            indeholder alle fulde værdier og ændringer, også uden for søgningen.
          </p>
          <button
            className="button secondary full"
            onClick={() =>
              downloadFile(
                "FlowLab-inputaendringer.json",
                JSON.stringify(
                  {
                    schemaVersion: 1,
                    exportedAt: new Date().toISOString(),
                    baseline: { id: baseline.id, revision: baseline.revision },
                    scenario: { id: scenario.id, revision: scenario.revision },
                    differences,
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <ArrowDownToLine size={16} />
            Hent alle inputændringer
          </button>
        </>
      ) : (
        <div className="empty-state compact">
          <GitBranch size={27} />
          <h3>Et rent udgangspunkt.</h3>
          <p>
            Der er endnu ingen ændrede antagelser. Justér fx antallet af
            medarbejdere i alternativet.
          </p>
        </div>
      )}
      <button
        className="button primary full input-diff-run"
        disabled={running}
        onClick={onRun}
      >
        <Play size={14} fill="currentColor" />
        Afprøv hypotesen
      </button>
    </section>
  );
}
