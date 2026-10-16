"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { MAX_FIXED_AUTOMATION_COST, type FlowModel } from "@tre/flow-engine";
import type { ExperimentSettingsValues } from "../lib/experiment-settings";

export default function ExperimentSettings({
  baseline,
  scenario,
  onApply,
}: {
  baseline: FlowModel;
  scenario: FlowModel;
  onApply: (settings: ExperimentSettingsValues) => void;
}) {
  const initial = {
    horizon: String(baseline.horizon / 3600000),
    start: String(baseline.observationStart / 3600000),
    events: String(baseline.maxEvents),
    baselineCost: String(baseline.fixedAutomationCost),
    scenarioCost: String(scenario.fixedAutomationCost),
  };
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  const mismatched =
    baseline.horizon !== scenario.horizon ||
    baseline.observationStart !== scenario.observationStart ||
    baseline.maxEvents !== scenario.maxEvents;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || mismatched;
  const field = (key: keyof typeof draft, value: string) => {
    setDraft({ ...draft, [key]: value });
    setError("");
  };
  return (
    <section
      className="panel experiment-settings"
      aria-labelledby="experiment-settings-title"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">SAMMENLIGN PÅ SAMME GRUNDLAG</span>
          <h3 id="experiment-settings-title">Forsøgets rammer</h3>
          <p>
            Fælles tidsvindue og beregningsloft. Omkostningen kan være
            forskellig.
          </p>
        </div>
        <SlidersHorizontal size={21} />
      </div>
      {mismatched && (
        <p className="notice-text">
          Modellerne har forskellige rammer. Felterne tager udgangspunkt i
          baseline. Anvend dem for at give begge modeller samme periode og
          hændelsesloft.
        </p>
      )}
      <div className="experiment-settings-fields">
        <label>
          Fælles simulationshorisont (timer)
          <input
            type="number"
            min={0.000001}
            max={8760}
            step="any"
            value={draft.horizon}
            onChange={(event) => field("horizon", event.target.value)}
          />
        </label>
        <label>
          Fælles målestart (timer)
          <input
            type="number"
            min={0}
            max={8760}
            step="any"
            value={draft.start}
            onChange={(event) => field("start", event.target.value)}
          />
        </label>
        <label>
          Hændelsesloft pr. kørsel
          <input
            type="number"
            min={1}
            max={5000000}
            step={1}
            value={draft.events}
            onChange={(event) => field("events", event.target.value)}
          />
        </label>
      </div>
      <p className="field-hint">
        Horisonten er simuleringens stop. Før målestart fortsætter køer og
        arbejde; kun sager, der afsluttes i målevinduet, tæller som throughput.
        Deres tid regnes fra den oprindelige ankomst. Ingen automatisk overtid.
      </p>
      <div className="experiment-cost-fields">
        <label>
          Fast automation, baseline (kr.)
          <input
            type="number"
            min={0}
            max={MAX_FIXED_AUTOMATION_COST}
            step="any"
            value={draft.baselineCost}
            onChange={(event) => field("baselineCost", event.target.value)}
          />
        </label>
        <label>
          Fast automation, alternativ (kr.)
          <input
            type="number"
            min={0}
            max={MAX_FIXED_AUTOMATION_COST}
            step="any"
            value={draft.scenarioCost}
            onChange={(event) => field("scenarioCost", event.target.value)}
          />
        </label>
      </div>
      <p className="field-hint">
        Beløbet medregnes én gang pr. kørsel og omfatter hele den valgte
        periode. Det fordeles ikke automatisk efter målestart. Lønkapacitet og
        variable aktivitetsomkostninger lægges til særskilt.
      </p>
      <div className="experiment-settings-actions">
        <button
          className="button primary"
          disabled={!dirty}
          onClick={() => {
            try {
              if (
                Object.values(draft).some(
                  (value) => !value.trim() || !Number.isFinite(Number(value)),
                )
              )
                throw new Error("Udfyld alle fem felter med gyldige tal.");
              onApply({
                horizon: Math.round(Number(draft.horizon) * 3600000),
                observationStart: Math.round(Number(draft.start) * 3600000),
                maxEvents: Number(draft.events),
                baselineAutomationCost: Number(draft.baselineCost),
                scenarioAutomationCost: Number(draft.scenarioCost),
              });
              setError("");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Rammerne kunne ikke gemmes.",
              );
            }
          }}
        >
          Anvend fælles rammer
        </button>
        <p className="field-hint">
          Et nået hændelsesloft giver et ufuldstændigt resultat. Der kan ikke
          eksporteres en komplet rapport på det grundlag.
        </p>
      </div>
      {dirty && (
        <p role="status" className="field-hint">
          Disse felter er et udkast. Tryk Anvend fælles rammer for at bruge dem
          i næste sammenligning.
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
