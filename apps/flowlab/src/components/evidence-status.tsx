"use client";
import { BadgeCheck, ChevronRight, FlaskConical } from "lucide-react";
import type { FlowModel, HoldoutAssessment } from "@tre/flow-engine";
import { evidenceStatus } from "../lib/evidence-status";
import { formatNumber } from "../lib/document";

export default function EvidenceStatus({
  baseline,
  assessment,
  sourceAvailable,
  onOpenData,
}: {
  baseline: FlowModel;
  assessment: HoldoutAssessment | null;
  sourceAvailable: boolean;
  onOpenData: () => void;
}) {
  const status = evidenceStatus(baseline, assessment);
  return (
    <details className={`evidence-status ${status.tone}`}>
      <summary>
        {status.tone === "met" ? (
          <BadgeCheck size={17} />
        ) : (
          <FlaskConical size={17} />
        )}
        <span>
          {status.label}
          {assessment && !sourceAvailable ? " · kildedata mangler" : ""}
        </span>
        <ChevronRight size={15} />
      </summary>
      <div className="evidence-details">
        <p>{status.detail}</p>
        {assessment && (
          <>
            <dl>
              <div>
                <dt>Testet periode</dt>
                <dd>{status.period}</dd>
              </div>
              <div>
                <dt>Kilde</dt>
                <dd>{assessment.source.name}</dd>
              </div>
              <div>
                <dt>Observerede afslutninger</dt>
                <dd>
                  {formatNumber(assessment.metrics.throughput.observed)} ·{" "}
                  {assessment.seeds.length} simulerede seeds
                </dd>
              </div>
            </dl>
            <p>
              Vurderingen gælder den angivne periode og er ingen garanti for
              fremtidig drift. En lille stikprøve giver et begrænset grundlag.
            </p>
            {!sourceAvailable && (
              <p className="notice-text">
                Vurderingens rensede kildedata mangler i arbejdsrummet. Tal og
                kildehenvisning er bevaret, men perioden kan ikke efterprøves
                fuldt fra rækkerne her.
              </p>
            )}
          </>
        )}
        <button className="text-button" onClick={onOpenData}>
          Se datagrundlag og holdout <ChevronRight size={14} />
        </button>
      </div>
    </details>
  );
}
