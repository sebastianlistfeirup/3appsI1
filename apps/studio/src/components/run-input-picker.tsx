"use client";
import { useState } from "react";
import type { Artifact, Project } from "../lib/model";
import {
  inputSelectionIssue,
  latestInputVersionIds,
} from "../lib/input-selection";
import { Notice } from "./primitives";

const PAGE_SIZE = 8;
export function RunInputPicker({
  project,
  selected,
  onChange,
  correction,
}: {
  project: Project;
  selected: string[];
  onChange: (ids: string[]) => void;
  correction: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const families = new Map<string, Artifact[]>();
  for (const file of project.artifacts)
    families.set(file.artifactId, [
      ...(families.get(file.artifactId) ?? []),
      file,
    ]);
  const all = [...families.values()].map((versions) =>
    versions.sort((a, b) => b.version - a.version),
  );
  const matching = all.filter((versions) =>
    versions.some((file) =>
      file.name
        .toLocaleLowerCase("da")
        .includes(search.toLocaleLowerCase("da")),
    ),
  );
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const issue = inputSelectionIssue(project, selected);
  function choose(versions: Artifact[], id?: string) {
    const remaining = selected.filter(
      (selectedId) => !versions.some((file) => file.id === selectedId),
    );
    onChange(id ? [...remaining, id] : remaining);
  }
  return (
    <details className="run-input-picker" open={Boolean(issue) || undefined}>
      <summary>
        Vælg inputfiler · {selected.length} af {all.length} filer
      </summary>
      <p>
        {correction
          ? "Rettelsen foreslår de tidligere input og de gennemgåede output. Senere ændringer er ikke valgt automatisk."
          : "De nyeste filversioner er foreslået. Vælg kun det arbejde, du har brug for; du kan også vælge en tidligere version."}{" "}
        Valget låses, når du fortsætter.
      </p>
      {issue && <Notice danger>{issue}</Notice>}
      {all.length > 0 ? (
        <>
          <div className="run-input-tools">
            <label>
              Søg inputfiler
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Filnavn…"
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(latestInputVersionIds(project))}
            >
              Vælg alle nyeste
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onChange([])}
            >
              Fravælg alle
            </button>
          </div>
          <div className="run-input-list">
            {matching
              .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
              .map((versions) => {
                const newest = versions[0]!;
                const chosen = versions.find((file) =>
                  selected.includes(file.id),
                );
                return (
                  <div className="run-input-row" key={newest.artifactId}>
                    <label className="run-input-check">
                      <input
                        type="checkbox"
                        checked={Boolean(chosen)}
                        onChange={(event) =>
                          choose(
                            versions,
                            event.target.checked ? newest.id : undefined,
                          )
                        }
                        aria-label={`Medtag ${newest.name}`}
                      />
                      <span>
                        {newest.name}
                        <small>
                          {versions.length} versioner
                          {chosen && chosen.id !== newest.id
                            ? " · tidligere version valgt"
                            : ""}
                        </small>
                      </span>
                    </label>
                    <select
                      aria-label={`Inputversion af ${newest.name}`}
                      value={chosen?.id ?? newest.id}
                      disabled={!chosen}
                      onChange={(event) => choose(versions, event.target.value)}
                    >
                      {versions.map((file) => (
                        <option key={file.id} value={file.id}>
                          v{file.version} · {file.name}
                          {file.id === newest.id ? " · nyeste" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            {matching.length === 0 && (
              <p>Ingen filnavne matcher din søgning.</p>
            )}
          </div>
          {pages > 1 && (
            <div className="run-input-pages">
              <button
                type="button"
                className="text-button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Forrige filer
              </button>
              <span>
                Side {currentPage + 1} af {pages} · {matching.length} filer
              </span>
              <button
                type="button"
                className="text-button"
                disabled={currentPage + 1 === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Næste filer
              </button>
            </div>
          )}
        </>
      ) : (
        <p>
          Projektet har endnu ingen filer. Du kan starte med bestillingen og
          opgavens krav.
        </p>
      )}
    </details>
  );
}
