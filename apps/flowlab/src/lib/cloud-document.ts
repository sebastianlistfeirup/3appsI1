import { z } from "zod";
import { DomainError } from "@tre/contracts";
import type { Json } from "@tre/database";
import { membershipTemplate, modelSchema, parseModel } from "@tre/flow-engine";
import { parseFlowJobInput } from "@tre/flow-jobs/input";

/** The optional server stores models, not unverified browser histories or reported results. */
const schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("flow.models"),
    baseline: modelSchema,
    scenario: modelSchema,
    context: z.string().max(5000),
  })
  .strict();
export function validateProjectDocument(value: unknown): Json {
  try {
    const parsed = schema.parse(value);
    return {
      ...parsed,
      baseline: parseModel(parsed.baseline),
      scenario: parseModel(parsed.scenario),
    } as unknown as Json;
  } catch {
    throw new DomainError(
      "INVALID_INPUT",
      "Projektet skal indeholde to gyldige FlowLab-modeller og højst 5.000 tegn kontekst.",
      400,
    );
  }
}
export function newProjectDocument(name: string): Json {
  const baseline = membershipTemplate(),
    scenario = structuredClone(baseline);
  baseline.name = `${name} · baseline`.slice(0, 100);
  scenario.name = `${name} · alternativ`.slice(0, 100);
  scenario.id = `${baseline.id}-scenario`;
  return validateProjectDocument({
    schemaVersion: 1,
    kind: "flow.models",
    baseline,
    scenario,
    context: "Syntetisk startmodel. Ingen organisationsdata er indlæst.",
  });
}
export function validateFlowJob(kind: string, input: unknown): Json {
  if (kind !== "flow.compare")
    throw new DomainError(
      "CAPABILITY_NOT_CONNECTED",
      "Denne serverprofil understøtter kun FlowLabs lokale sammenligningsmotor.",
      409,
    );
  try {
    return parseFlowJobInput(input) as unknown as Json;
  } catch (error) {
    throw new DomainError(
      "INVALID_INPUT",
      error instanceof z.ZodError
        ? "Simulationsinput skal følge den versionslåste serverprofil med præcis 30 seeds."
        : error instanceof Error
          ? error.message
          : "Simulationsinput er ugyldigt.",
      400,
    );
  }
}
