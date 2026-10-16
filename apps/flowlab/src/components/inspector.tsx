"use client";
import { useState } from "react";
import {
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import type { FlowModel, FlowNode, Distribution } from "@tre/flow-engine";
import { nodeIcons, nodeLabels } from "./model-canvas";
import { formatNumber } from "../lib/document";
import ArrivalEditor from "./arrival-editor";
export default function Inspector({
  model,
  selected,
  variant,
  onChange,
  onClose,
}: {
  model: FlowModel;
  selected: string;
  variant: string;
  onChange: (next: FlowModel) => void;
  onClose: () => void;
}) {
  const [arrivalEditorOpen, setArrivalEditorOpen] = useState(false);
  const node = model.nodes.find((n) => n.id === selected);
  if (!node)
    return (
      <aside className="inspector">
        <h3>Vælg et trin</h3>
        <p>Klik på en node i modellen for at justere dens antagelser.</p>
      </aside>
    );
  const Icon = nodeIcons[node.kind],
    resource = model.resources.find((r) => r.id === node.resourceId),
    edges = model.edges.filter((e) => e.source === node.id);
  const patchNode = (patch: Partial<FlowNode>) =>
    onChange({
      ...model,
      nodes: model.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  const patchDuration = (key: string, value: number) => {
    if (!node.duration) return;
    patchNode({
      duration: {
        ...node.duration,
        [key]: Math.max(1, Math.round(value * 60000)),
      } as Distribution,
    });
  };
  return (
    <aside className="inspector">
      <div className="inspector-top">
        <span>
          <SlidersHorizontal size={15} />
          Indstillinger
        </span>
        <button
          className="icon-button inspector-close"
          onClick={onClose}
          aria-label="Luk indstillinger"
        >
          <X size={17} />
        </button>
      </div>
      <div className={`inspector-icon kind-${node.kind}`}>
        <Icon size={24} />
      </div>
      <span className="eyebrow">
        {nodeLabels[node.kind]} · {variant}
      </span>
      <h3>{node.label}</h3>
      <p className="inspector-description">
        En lille ændring her kan gøre en stor forskel længere nede i flowet.
      </p>
      <label>
        Navn
        <input
          value={node.label}
          onChange={(e) => patchNode({ label: e.target.value || "Nyt trin" })}
        />
      </label>
      {node.kind === "source" && (
        <>
          <label>
            Simulationshorisont (timer)
            <input
              type="number"
              min={0.01}
              max={8760}
              step={0.5}
              value={model.horizon / 3600000}
              onChange={(e) =>
                onChange({
                  ...model,
                  horizon: Math.max(
                    1,
                    Math.round(Number(e.target.value) * 3600000),
                  ),
                })
              }
            />
          </label>
          <p className="field-hint">
            Målingen starter {formatNumber(model.observationStart / 3600000, 2)}{" "}
            timer efter simulationsstart. Fælles periode og målestart for begge
            modeller findes under Scenarier.
          </p>
          <label>
            SLA (minutter)
            <input
              type="number"
              min={1}
              value={model.sla / 60000}
              onChange={(e) =>
                onChange({
                  ...model,
                  sla: Math.max(1, Math.round(Number(e.target.value) * 60000)),
                })
              }
            />
          </label>
          {model.arrivals.type === "poisson" ? (
            <>
              <label>
                Forventede nye ankomster i perioden
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={Math.round(
                    model.horizon / model.arrivals.meanInterval,
                  )}
                  onChange={(e) => {
                    if (model.arrivals.type === "poisson")
                      onChange({
                        ...model,
                        arrivals: {
                          ...model.arrivals,
                          meanInterval: Math.max(
                            1,
                            Math.round(
                              model.horizon /
                                Math.max(1, Number(e.target.value)),
                            ),
                          ),
                        },
                      });
                  }}
                />
              </label>
              <label>
                Loft for nye sager
                <input
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  value={model.arrivals.maxCases}
                  onChange={(event) => {
                    if (model.arrivals.type === "poisson")
                      onChange({
                        ...model,
                        arrivals: {
                          ...model.arrivals,
                          maxCases: Math.max(
                            1,
                            Math.round(Number(event.target.value)),
                          ),
                        },
                      });
                  }}
                />
              </label>
              <label>
                Startkø (sager)
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={model.arrivals.initialBacklog}
                  onChange={(e) => {
                    if (model.arrivals.type === "poisson")
                      onChange({
                        ...model,
                        arrivals: {
                          ...model.arrivals,
                          initialBacklog: Math.max(
                            0,
                            Math.round(Number(e.target.value)),
                          ),
                        },
                      });
                  }}
                />
              </label>
              <p className="field-hint">
                Poisson-ankomster: tidsrummet mellem sager er eksponentielt
                fordelt. Antallet varierer mellem seeds. Loftet er en øvre
                grænse for nye sager, ikke et forventet antal. Nye sager og
                startkø må tilsammen højst være 100.000.
              </p>
            </>
          ) : (
            <p className="field-hint">
              {model.arrivals.cases.length.toLocaleString("da-DK")} eksplicitte
              ankomster med bestemte tidspunkter og sagstyper.
            </p>
          )}
          <button
            className="button secondary arrival-editor-trigger"
            onClick={() => setArrivalEditorOpen(true)}
          >
            Rediger ankomster
          </button>
          {arrivalEditorOpen && (
            <ArrivalEditor
              model={model}
              variant={variant}
              onClose={() => setArrivalEditorOpen(false)}
              onApply={(arrivals) => {
                onChange({ ...model, arrivals });
                setArrivalEditorOpen(false);
              }}
            />
          )}
        </>
      )}
      {(node.kind === "activity" || node.kind === "wait") && (
        <>
          <div className="field-divider" />
          <label>
            Varighedsfordeling
            <select
              value={node.duration?.type ?? "fixed"}
              onChange={(e) =>
                patchNode({
                  duration:
                    e.target.value === "fixed"
                      ? { type: "fixed", value: 10 * 60000 }
                      : e.target.value === "triangular"
                        ? {
                            type: "triangular",
                            min: 5 * 60000,
                            mode: 10 * 60000,
                            max: 20 * 60000,
                          }
                        : { type: "exponential", mean: 10 * 60000 },
                })
              }
            >
              <option value="fixed">Fast varighed</option>
              <option value="triangular">Trekantet fordeling</option>
              <option value="exponential">Eksponentiel fordeling</option>
            </select>
          </label>
          {node.duration?.type === "triangular" ? (
            <div className="triple-fields">
              {(["min", "mode", "max"] as const).map((key, i) => (
                <label key={key}>
                  {["Min.", "Typisk", "Maks."][i]}
                  <input
                    type="number"
                    min={0.001}
                    step={1}
                    value={
                      node.duration?.type === "triangular"
                        ? Number((node.duration[key] / 60000).toFixed(3))
                        : 0
                    }
                    onChange={(e) => patchDuration(key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          ) : (
            <label>
              {node.duration?.type === "exponential"
                ? "Gennemsnit"
                : "Varighed"}{" "}
              (minutter)
              <input
                type="number"
                min={0.001}
                step={1}
                value={
                  node.duration
                    ? Number(
                        (
                          (node.duration.type === "fixed"
                            ? node.duration.value
                            : node.duration.mean) / 60000
                        ).toFixed(3),
                      )
                    : 1
                }
                onChange={(e) =>
                  patchDuration(
                    node.duration?.type === "fixed" ? "value" : "mean",
                    Number(e.target.value),
                  )
                }
              />
            </label>
          )}
          <p className="field-hint">
            Alle varigheder angives i minutter. Motoren beregner i hele
            millisekunder.
          </p>
        </>
      )}
      {node.kind === "activity" && (
        <>
          <div className="field-divider" />
          <label>
            Ressourcepool
            <select
              value={node.resourceId ?? ""}
              onChange={(e) => patchNode({ resourceId: e.target.value })}
            >
              <option value="">Vælg ressource…</option>
              {model.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              const id = crypto.randomUUID();
              onChange({
                ...model,
                resources: [
                  ...model.resources,
                  {
                    id,
                    label: `Nyt team ${model.resources.length + 1}`,
                    capacity: 1,
                    hourlyCost: 285,
                    calendar: [],
                  },
                ],
                nodes: model.nodes.map((n) =>
                  n.id === node.id ? { ...n, resourceId: id } : n,
                ),
              });
            }}
          >
            <Plus size={13} />
            Opret ressourcepool
          </button>
          {resource && (
            <>
              <label>
                Poolens navn
                <input
                  value={resource.label}
                  onChange={(e) =>
                    onChange({
                      ...model,
                      resources: model.resources.map((r) =>
                        r.id === resource.id
                          ? { ...r, label: e.target.value || "Nyt team" }
                          : r,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Medarbejdere i puljen
                <div className="stepper">
                  <button
                    aria-label="Fjern en medarbejder"
                    disabled={resource.capacity === 0}
                    onClick={() =>
                      onChange({
                        ...model,
                        resources: model.resources.map((r) =>
                          r.id === resource.id
                            ? { ...r, capacity: r.capacity - 1 }
                            : r,
                        ),
                      })
                    }
                  >
                    −
                  </button>
                  <input
                    aria-label="Antal medarbejdere"
                    type="number"
                    min={0}
                    max={1000}
                    value={resource.capacity}
                    onChange={(e) =>
                      onChange({
                        ...model,
                        resources: model.resources.map((r) =>
                          r.id === resource.id
                            ? {
                                ...r,
                                capacity: Math.max(
                                  0,
                                  Math.min(
                                    1000,
                                    Math.round(Number(e.target.value)),
                                  ),
                                ),
                              }
                            : r,
                        ),
                      })
                    }
                  />
                  <button
                    aria-label="Tilføj en medarbejder"
                    disabled={resource.capacity === 1000}
                    onClick={() =>
                      onChange({
                        ...model,
                        resources: model.resources.map((r) =>
                          r.id === resource.id
                            ? { ...r, capacity: r.capacity + 1 }
                            : r,
                        ),
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </label>
              <label>
                Lønkapacitet (kr. pr. time)
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={resource.hourlyCost}
                  onChange={(e) =>
                    onChange({
                      ...model,
                      resources: model.resources.map((r) =>
                        r.id === resource.id
                          ? {
                              ...r,
                              hourlyCost: Math.max(0, Number(e.target.value)),
                            }
                          : r,
                      ),
                    })
                  }
                />
              </label>
              <details className="calendar-details">
                <summary>
                  <CalendarDays size={14} />
                  Arbejdsplan
                </summary>
                <p className="field-hint">
                  Tom plan = åben i hele vinduet. Pauseret arbejde fortsætter
                  ved næste åbning.
                </p>
                {resource.calendar.map((slot, i) => (
                  <div className="calendar-slot" key={i}>
                    <label>
                      Fra (min)
                      <input
                        type="number"
                        min={0}
                        value={slot.start / 60000}
                        onChange={(e) =>
                          onChange({
                            ...model,
                            resources: model.resources.map((r) =>
                              r.id === resource.id
                                ? {
                                    ...r,
                                    calendar: r.calendar.map((s, j) =>
                                      i === j
                                        ? {
                                            ...s,
                                            start: Math.max(
                                              0,
                                              Math.round(
                                                Number(e.target.value) * 60000,
                                              ),
                                            ),
                                          }
                                        : s,
                                    ),
                                  }
                                : r,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Til (min)
                      <input
                        type="number"
                        min={1}
                        value={slot.end / 60000}
                        onChange={(e) =>
                          onChange({
                            ...model,
                            resources: model.resources.map((r) =>
                              r.id === resource.id
                                ? {
                                    ...r,
                                    calendar: r.calendar.map((s, j) =>
                                      i === j
                                        ? {
                                            ...s,
                                            end: Math.max(
                                              1,
                                              Math.round(
                                                Number(e.target.value) * 60000,
                                              ),
                                            ),
                                          }
                                        : s,
                                    ),
                                  }
                                : r,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label={`Fjern arbejdstid ${i + 1}`}
                      onClick={() =>
                        onChange({
                          ...model,
                          resources: model.resources.map((r) =>
                            r.id === resource.id
                              ? {
                                  ...r,
                                  calendar: r.calendar.filter(
                                    (_, j) => j !== i,
                                  ),
                                }
                              : r,
                          ),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-button"
                  onClick={() =>
                    onChange({
                      ...model,
                      resources: model.resources.map((r) =>
                        r.id === resource.id
                          ? {
                              ...r,
                              calendar: [
                                ...r.calendar,
                                {
                                  start: r.calendar.at(-1)?.end ?? 0,
                                  end:
                                    (r.calendar.at(-1)?.end ?? 0) + 4 * 3600000,
                                },
                              ],
                            }
                          : r,
                      ),
                    })
                  }
                >
                  <Plus size={13} />
                  Tilføj arbejdstid
                </button>
              </details>
            </>
          )}
          <label>
            Variabel pris pr. besøg (kr.)
            <input
              type="number"
              min={0}
              value={node.variableCost}
              onChange={(e) =>
                patchNode({ variableCost: Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
        </>
      )}
      {node.kind === "rework" && (
        <label>
          Maksimale besøg pr. sag
          <input
            type="number"
            min={1}
            max={20}
            value={node.maxVisits}
            onChange={(e) =>
              patchNode({
                maxVisits: Math.max(
                  1,
                  Math.min(20, Math.round(Number(e.target.value))),
                ),
              })
            }
          />
        </label>
      )}
      {node.kind === "decision" && (
        <label>
          Routingregel
          <select
            value={
              edges.some((e) => e.caseType !== undefined)
                ? "type"
                : "probability"
            }
            onChange={(e) =>
              onChange({
                ...model,
                edges: model.edges.map((edge, i) =>
                  edge.source === node.id
                    ? e.target.value === "type"
                      ? {
                          ...edge,
                          weight: undefined,
                          caseType: `type-${i + 1}`,
                        }
                      : {
                          ...edge,
                          caseType: undefined,
                          weight: 1 / Math.max(1, edges.length),
                        }
                    : edge,
                ),
              })
            }
          >
            <option value="probability">Sandsynligheder</option>
            <option value="type">Eksplicit sagstype</option>
          </select>
        </label>
      )}
      {node.kind !== "sink" && (
        <>
          <div className="field-divider" />
          <span className="field-label">Næste trin</span>
          {edges.map((edge) => (
            <div className="edge-editor" key={edge.id}>
              <label className="sr-only" htmlFor={`edge-${edge.id}`}>
                Forbindelse til næste trin
              </label>
              <div className="edge-row">
                <ArrowRight size={14} />
                <select
                  id={`edge-${edge.id}`}
                  value={edge.target}
                  onChange={(e) =>
                    onChange({
                      ...model,
                      edges: model.edges.map((x) =>
                        x.id === edge.id ? { ...x, target: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {model.nodes
                    .filter((n) => n.id !== node.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={`Fjern forbindelse til ${model.nodes.find((n) => n.id === edge.target)?.label}`}
                  onClick={() =>
                    onChange({
                      ...model,
                      edges: model.edges.filter((e) => e.id !== edge.id),
                    })
                  }
                >
                  <X size={13} />
                </button>
              </div>
              {node.kind === "decision" && edge.caseType !== undefined && (
                <label>
                  Sagstype
                  <input
                    value={edge.caseType}
                    onChange={(e) =>
                      onChange({
                        ...model,
                        edges: model.edges.map((x) =>
                          x.id === edge.id
                            ? { ...x, caseType: e.target.value || "standard" }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              )}
              {node.kind === "decision" && edge.caseType === undefined && (
                <label>
                  Sandsynlighed (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={(edge.weight ?? 0) * 100}
                    onChange={(e) =>
                      onChange({
                        ...model,
                        edges: model.edges.map((x) =>
                          x.id === edge.id
                            ? {
                                ...x,
                                caseType: undefined,
                                weight: Math.max(
                                  0,
                                  Math.min(1, Number(e.target.value) / 100),
                                ),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              )}
            </div>
          ))}
          {(node.kind === "decision" || !edges.length) && (
            <button
              className="text-button"
              onClick={() => {
                const target =
                  model.nodes.find(
                    (n) => n.kind === "sink" && n.id !== node.id,
                  ) ??
                  model.nodes.find(
                    (n) => n.id !== node.id && n.kind !== "source",
                  );
                if (target)
                  onChange({
                    ...model,
                    edges: [
                      ...model.edges,
                      {
                        id: crypto.randomUUID(),
                        source: node.id,
                        target: target.id,
                        ...(node.kind === "decision"
                          ? edges.some((e) => e.caseType !== undefined)
                            ? { caseType: "standard" }
                            : { weight: 0 }
                          : {}),
                      },
                    ],
                  });
              }}
            >
              <Plus size={13} />
              Tilføj forbindelse
            </button>
          )}
          {node.kind === "decision" &&
            !edges.some((e) => e.caseType !== undefined) && (
              <p
                className={`field-hint ${Math.abs(edges.reduce((s, e) => s + (e.weight ?? 0), 0) - 1) > 1e-9 ? "error-text" : ""}`}
              >
                Sum:{" "}
                {formatNumber(
                  edges.reduce((s, e) => s + (e.weight ?? 0), 0) * 100,
                )}{" "}
                % · skal være 100 %
              </p>
            )}
        </>
      )}
      {node.kind !== "source" &&
        (node.kind !== "sink" ||
          model.nodes.filter((n) => n.kind === "sink").length > 1) && (
          <button
            className="text-button danger delete-node"
            onClick={() =>
              onChange({
                ...model,
                nodes: model.nodes.filter((n) => n.id !== node.id),
                edges: model.edges.filter(
                  (e) => e.source !== node.id && e.target !== node.id,
                ),
              })
            }
          >
            <Trash2 size={14} />
            Fjern trin
          </button>
        )}
      <div className="inspector-footnote">
        <span className="dot" />
        Syntetiske antagelser. Ikke kalibreret.
      </div>
    </aside>
  );
}
