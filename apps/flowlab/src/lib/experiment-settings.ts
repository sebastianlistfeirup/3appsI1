import { MAX_FIXED_AUTOMATION_COST, type FlowModel } from "@tre/flow-engine";
import type { FlowDocument } from "./document";
export interface ExperimentSettingsValues {
  horizon: number;
  observationStart: number;
  maxEvents: number;
  baselineAutomationCost: number;
  scenarioAutomationCost: number;
}
export function applyExperimentSettings(
  doc: FlowDocument,
  settings: ExperimentSettingsValues,
): FlowDocument {
  if (
    !Number.isSafeInteger(settings.horizon) ||
    settings.horizon < 1 ||
    settings.horizon > 365 * 24 * 3600000
  )
    throw new Error(
      "Simulationshorisonten skal være positiv og højst 365 døgn.",
    );
  if (
    !Number.isSafeInteger(settings.observationStart) ||
    settings.observationStart < 0 ||
    settings.observationStart >= settings.horizon
  )
    throw new Error(
      "Målestart skal ligge fra nul til før simulationshorisonten.",
    );
  if (
    !Number.isSafeInteger(settings.maxEvents) ||
    settings.maxEvents < 1 ||
    settings.maxEvents > 5000000
  )
    throw new Error(
      "Hændelsesloftet skal være et heltal fra 1 til 5.000.000 pr. kørsel.",
    );
  if (
    [settings.baselineAutomationCost, settings.scenarioAutomationCost].some(
      (value) =>
        !Number.isFinite(value) ||
        value < 0 ||
        value > MAX_FIXED_AUTOMATION_COST,
    )
  )
    throw new Error(
      "Fast automationsomkostning skal være mellem 0 og 1.000.000.000.000 kr. pr. kørsel.",
    );
  const apply = (model: FlowModel, cost: number): FlowModel => {
    if (
      model.horizon === settings.horizon &&
      model.observationStart === settings.observationStart &&
      model.maxEvents === settings.maxEvents &&
      model.fixedAutomationCost === cost
    )
      return model;
    return {
      ...model,
      revision: model.revision + 1,
      horizon: settings.horizon,
      observationStart: settings.observationStart,
      maxEvents: settings.maxEvents,
      fixedAutomationCost: cost,
    };
  };
  const baseline = apply(doc.baseline, settings.baselineAutomationCost),
    scenario = apply(doc.scenario, settings.scenarioAutomationCost);
  return baseline === doc.baseline && scenario === doc.scenario
    ? doc
    : { ...doc, baseline, scenario };
}
