"use client";
import { useState } from "react";
import { CSV_FIELDS, type CsvMapping } from "@tre/flow-engine";

const PAGE_SIZE = 20;
export function ColumnMapping({
  headers,
  mapping,
  disabled,
  onChange,
}: {
  headers: string[];
  mapping: CsvMapping;
  disabled: boolean;
  onChange: (mapping: CsvMapping) => void;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const filtered = headers.filter((header) =>
      header
        .toLocaleLowerCase("da")
        .includes(query.trim().toLocaleLowerCase("da")),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(
      currentPage * PAGE_SIZE,
      (currentPage + 1) * PAGE_SIZE,
    ),
    mapped = Object.values(mapping).filter(Boolean).length;
  return (
    <div className="column-mapping">
      {headers.length > PAGE_SIZE && (
        <>
          <label>
            Find kolonne
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Søg i kolonnenavne"
            />
          </label>
          <p className="field-hint">
            {mapped} af {headers.length} kolonner er knyttet til et felt. Alle
            tilknytninger gælder, også på andre sider. Øvrige kolonner udelades.
          </p>
        </>
      )}
      {visible.map((header) => (
        <label className="mapping-row" key={header}>
          <span>{header}</span>
          <select
            value={mapping[header] ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...mapping,
                [header]: event.target.value as CsvMapping[string],
              })
            }
          >
            <option value="">Udelad kolonne</option>
            {CSV_FIELDS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
      ))}
      {!visible.length && (
        <p className="notice-text">
          Ingen kolonner matcher søgningen. De eksisterende tilknytninger er
          bevaret.
        </p>
      )}
      {pages > 1 && (
        <div
          className="column-pagination"
          aria-label="Sider med kolonnemapping"
        >
          <button
            className="button subtle"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            aria-label="Vis forrige kolonner"
          >
            Forrige
          </button>
          <span>
            Side {currentPage + 1} af {pages}
          </span>
          <button
            className="button subtle"
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
            aria-label="Vis næste kolonner"
          >
            Næste
          </button>
        </div>
      )}
    </div>
  );
}
