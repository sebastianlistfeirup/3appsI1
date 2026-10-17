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
import type { FlowModel, FlowNode, ResourcePool } from "@tre/flow-engine";
import { nodeIcons, nodeLabels } from "./model-canvas";
import { formatNumber } from "../lib/document";
import ArrivalEditor from "./arrival-editor";
import DurationEditor from "./duration-editor";
import { diagramNodeDetail } from "../lib/diagram";
import InspectorField from "./inspector-field";
import {
  inputArrivalLimit,
  inputDecimal,
  inputExpectedArrivals,
  inputHorizon,
  inputLabel,
  inputNumber,
  inputTime,
} from "../lib/inspector-input";
import { parseDurationValue } from "../lib/duration-editor";
import { formatCaseTime } from "../lib/time-profile";
export default function Inspector({
  model,
  selected,
  variant,
  onChange,
  onManageResources,
  onClose,
}: {
  model: FlowModel;
  selected: string;
  variant: string;
  onChange: (next: FlowModel) => void;
  onManageResources: (id?: string) => void;
  onClose: () => void;
}) {
  const [arrivalEditorOpen, setArrivalEditorOpen] = useState(false);
  const [durationEditorOpen, setDurationEditorOpen] = useState(false);
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
  const patchResource = (patch: Partial<ResourcePool>) => {
    if (resource)
      onChange({
        ...model,
        resources: model.resources.map((pool) =>
          pool.id === resource.id ? { ...pool, ...patch } : pool,
        ),
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
        Felter anvendes med Enter eller når du forlader dem. Escape annullerer
        en igangværende indtastning.
      </p>
      <InspectorField
        label="Navn"
        wide
        value={node.label}
        parse={inputLabel}
        onApply={(label) => patchNode({ label })}
      />
      {node.kind === "source" && (
        <>
          <InspectorField
            label="Simulationshorisont (timer)"
            value={model.horizon}
            inputMode="decimal"
            format={(value) => inputTime(value, "hours")}
            parse={(text) => inputHorizon(text, model.observationStart)}
            onApply={(horizon) => onChange({ ...model, horizon })}
          />
          <p className="field-hint">
            Målingen starter {formatNumber(model.observationStart / 3600000, 2)}{" "}
            timer efter simulationsstart. Fælles periode og målestart for begge
            modeller findes under Scenarier.
          </p>
          <InspectorField
            label="SLA (minutter)"
            value={model.sla}
            inputMode="decimal"
            format={(value) => inputTime(value, "minutes")}
            parse={(text) =>
              parseDurationValue(text, "minutes", "SLA").milliseconds
            }
            onApply={(sla) => onChange({ ...model, sla })}
          />
          {model.arrivals.type === "poisson" ? (
            <>
              <InspectorField
                label="Forventede nye ankomster i perioden"
                value={model.arrivals.meanInterval}
                inputMode="decimal"
                format={(value) => inputDecimal(model.horizon / value)}
                parse={(text) => inputExpectedArrivals(text, model.horizon)}
                onApply={(meanInterval) => {
                  if (model.arrivals.type === "poisson")
                    onChange({
                      ...model,
                      arrivals: { ...model.arrivals, meanInterval },
                    });
                }}
              />
              <InspectorField
                label="Loft for nye sager"
                value={model.arrivals.maxCases}
                inputMode="numeric"
                parse={(text) => inputArrivalLimit(text, model, "maxCases")}
                onApply={(maxCases) => {
                  if (model.arrivals.type === "poisson")
                    onChange({
                      ...model,
                      arrivals: { ...model.arrivals, maxCases },
                    });
                }}
              />
              <InspectorField
                label="Startkø (sager)"
                value={model.arrivals.initialBacklog}
                inputMode="numeric"
                parse={(text) =>
                  inputArrivalLimit(text, model, "initialBacklog")
                }
                onApply={(initialBacklog) => {
                  if (model.arrivals.type === "poisson")
                    onChange({
                      ...model,
                      arrivals: { ...model.arrivals, initialBacklog },
                    });
                }}
              />
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
          <div className="inspector-duration-summary">
            <span className="field-label">Varighed</span>
            <strong>{diagramNodeDetail(node, model).primary}</strong>
            <span>
              {node.duration?.type === "triangular"
                ? "Trekantet fordeling"
                : node.duration?.type === "exponential"
                  ? "Eksponentiel fordeling"
                  : "Fast varighed"}
            </span>
            <button
              className="button secondary"
              onClick={() => setDurationEditorOpen(true)}
            >
              Rediger varighed
            </button>
          </div>
          {durationEditorOpen && (
            <DurationEditor
              key={`${variant}:${node.id}`}
              duration={node.duration ?? { type: "fixed", value: 600000 }}
              label={node.label}
              variant={variant}
              kind={node.kind}
              onClose={() => setDurationEditorOpen(false)}
              onApply={(duration) => {
                patchNode({ duration });
                setDurationEditorOpen(false);
              }}
            />
          )}
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
            disabled={model.resources.length >= 50}
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
            Opret ressourcepulje
          </button>
          <button
            className="text-button"
            onClick={() => onManageResources(resource?.id)}
          >
            Administrér alle puljer
          </button>
          {resource && (
            <>
              <InspectorField
                label="Poolens navn"
                key={`label:${resource.id}`}
                value={resource.label}
                parse={inputLabel}
                onApply={(label) => patchResource({ label })}
              />
              <InspectorField
                label="Medarbejdere i puljen"
                accessibleLabel="Antal medarbejdere"
                key={`capacity:${resource.id}`}
                value={resource.capacity}
                inputMode="numeric"
                parse={(text) => inputNumber(text, 0, 1000, true)}
                onApply={(capacity) => patchResource({ capacity })}
                before={
                  <button
                    aria-label="Fjern en medarbejder"
                    disabled={resource.capacity === 0}
                    onClick={() =>
                      patchResource({ capacity: resource.capacity - 1 })
                    }
                  >
                    −
                  </button>
                }
                after={
                  <button
                    aria-label="Tilføj en medarbejder"
                    disabled={resource.capacity === 1000}
                    onClick={() =>
                      patchResource({ capacity: resource.capacity + 1 })
                    }
                  >
                    +
                  </button>
                }
              />
              <InspectorField
                label="Lønkapacitet (kr. pr. time)"
                key={`cost:${resource.id}`}
                value={resource.hourlyCost}
                inputMode="decimal"
                parse={(text) => inputNumber(text, 0, 1000000)}
                onApply={(hourlyCost) => patchResource({ hourlyCost })}
              />
              <details className="calendar-details">
                <summary>
                  <CalendarDays size={14} />
                  Arbejdsplan
                </summary>
                <p className="field-hint">
                  Tom plan = åben i hele vinduet. Pauseret arbejde fortsætter
                  ved næste åbning.
                </p>
                {resource.calendar.length > 0 && (
                  <>
                    <p className="field-hint">
                      {formatNumber(resource.calendar.length)}{" "}
                      {resource.calendar.length === 1
                        ? "arbejdsinterval"
                        : "arbejdsintervaller"}{" "}
                      fra simulationsstart.
                    </p>
                    <ol className="inspector-calendar-preview">
                      {resource.calendar.slice(0, 3).map((slot, index) => (
                        <li key={index} title={`${slot.start}–${slot.end} ms`}>
                          {formatCaseTime(slot.start)}–
                          {formatCaseTime(slot.end)}
                        </li>
                      ))}
                    </ol>
                    {resource.calendar.length > 3 && (
                      <p className="field-hint">
                        De første 3 intervaller vises her. Hele planen findes i
                        ressourceeditoren.
                      </p>
                    )}
                  </>
                )}
                <button
                  className="text-button"
                  onClick={() => onManageResources(resource.id)}
                >
                  <CalendarDays size={14} />
                  Rediger arbejdsplan
                </button>
              </details>
            </>
          )}
          <InspectorField
            label="Variabel pris pr. besøg (kr.)"
            value={node.variableCost}
            inputMode="decimal"
            parse={(text) => inputNumber(text, 0, 1000000)}
            onApply={(variableCost) => patchNode({ variableCost })}
          />
        </>
      )}
      {node.kind === "rework" && (
        <InspectorField
          label="Maksimale besøg pr. sag"
          value={node.maxVisits}
          inputMode="numeric"
          parse={(text) => inputNumber(text, 1, 20, true)}
          onApply={(maxVisits) => patchNode({ maxVisits })}
        />
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
                <InspectorField
                  label="Sagstype"
                  value={edge.caseType}
                  parse={inputLabel}
                  onApply={(caseType) =>
                    onChange({
                      ...model,
                      edges: model.edges.map((item) =>
                        item.id === edge.id ? { ...item, caseType } : item,
                      ),
                    })
                  }
                />
              )}
              {node.kind === "decision" && edge.caseType === undefined && (
                <InspectorField
                  label="Sandsynlighed (%)"
                  value={edge.weight ?? 0}
                  inputMode="decimal"
                  format={(value) => inputDecimal(value * 100)}
                  parse={(text) => inputNumber(text, 0, 100) / 100}
                  onApply={(weight) =>
                    onChange({
                      ...model,
                      edges: model.edges.map((item) =>
                        item.id === edge.id
                          ? { ...item, caseType: undefined, weight }
                          : item,
                      ),
                    })
                  }
                />
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
        <span>
          {model.evidence === "synthetic"
            ? "Syntetiske antagelser."
            : "Importeret modelgrundlag."}{" "}
          Holdout vurderer baseline særskilt.
        </span>
      </div>
    </aside>
  );
}
