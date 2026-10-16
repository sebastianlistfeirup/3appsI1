"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Bookmark, Search, Save } from "lucide-react";
import type { ModelSnapshot } from "../lib/document";
import { formatNumber } from "../lib/document";
export default function ScenarioLibrary({
  versions,
  onSave,
  onOpen,
}: {
  versions: ModelSnapshot[];
  onSave: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [showAll, setShowAll] = useState(false);
  const filtered = useMemo(
      () =>
        versions.filter((version) =>
          `${version.label} ${version.context?.scenarioName ?? ""} ${version.context?.hypothesis ?? ""}`
            .toLocaleLowerCase("da-DK")
            .includes(query.toLocaleLowerCase("da-DK")),
        ),
      [versions, query],
    ),
    shown = showAll ? filtered : filtered.slice(0, 6);
  return (
    <section
      className="panel scenario-library"
      aria-labelledby="saved-scenarios-heading"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">GODE IDÉER KAN GENBRUGES</span>
          <h3 id="saved-scenarios-heading">Dine gemte scenarier</h3>
          <p>
            Behold flere alternativer med deres egen baseline, hypotese og seed.
          </p>
        </div>
        <button className="button secondary" onClick={onSave}>
          <Save size={16} />
          Gem dette scenarie
        </button>
      </div>
      <p className="field-hint">
        Når du åbner et gemt scenarie, gemmes et ændret udkast først som en
        sikkerhedskopi. Data og din beslutningskladde bliver i arbejdsrummet. Du
        kan stadig fortryde skiftet.
      </p>
      {versions.length > 0 ? (
        <>
          <label className="saved-scenario-search">
            Find gemt scenarie
            <span className="case-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowAll(false);
                }}
                maxLength={100}
                placeholder="Navn, hypotese eller version"
              />
            </span>
          </label>
          <div className="saved-scenario-grid">
            {shown.map((version) => (
              <article className="saved-scenario-card" key={version.id}>
                <div className="saved-scenario-meta">
                  <span>
                    <Bookmark size={14} />
                    {version.label}
                  </span>
                  <time dateTime={version.savedAt}>
                    {new Date(version.savedAt).toLocaleDateString("da-DK")}
                  </time>
                </div>
                <h4>
                  {version.context?.scenarioName || version.scenario.name}
                </h4>
                <p className="saved-scenario-hypothesis">
                  {version.context?.hypothesis ||
                    (version.context
                      ? "Ingen hypotese angivet."
                      : "Dette ældre snapshot har ingen gemt hypotese.")}
                </p>
                <dl>
                  <div>
                    <dt>Baseline</dt>
                    <dd>
                      {version.baseline.name} · {version.baseline.nodes.length}{" "}
                      trin
                    </dd>
                  </div>
                  <div>
                    <dt>Kapacitet</dt>
                    <dd>
                      {version.scenario.resources
                        .map(
                          (pool) =>
                            `${pool.capacity} ${pool.label.toLowerCase()}`,
                        )
                        .join(" · ") || "Ingen ressourcer"}
                    </dd>
                  </div>
                  <div>
                    <dt>Fælles seed</dt>
                    <dd>
                      {version.context?.baseSeed ??
                        "Ikke gemt i ældre snapshot"}
                    </dd>
                  </div>
                </dl>
                <button
                  className="text-button"
                  aria-label={`Åbn ${version.label}: ${version.context?.scenarioName || version.scenario.name}`}
                  onClick={() => onOpen(version.id)}
                >
                  Åbn som udkast
                  <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <p className="empty-state compact">
              Ingen gemte scenarier matcher din søgning.
            </p>
          )}
          <div className="saved-scenario-footer">
            <span>
              {formatNumber(filtered.length)} af {versions.length} gemte
              snapshots · højst 30 / 16 MB
            </span>
            {filtered.length > 6 && (
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? "Vis færre scenarier"
                  : `Vis alle ${filtered.length} scenarier`}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="scenario-library-empty">
          <Bookmark size={28} />
          <div>
            <h4>Giv din næste idé et sted at lande.</h4>
            <p>
              Gem dit nuværende alternativ, justér én antagelse, og sammenlign
              igen. Så kan du vende tilbage til begge idéer med deres
              oprindelige input.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
