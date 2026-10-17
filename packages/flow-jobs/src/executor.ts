import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { assertReportReady, type Comparison } from "@tre/flow-engine";
import { canonicalJson, hashJson, type Json } from "@tre/database";
import { JobFault, type JobHandler } from "@tre/jobs";
import {
  FLOW_JOB_DEADLINE_MS,
  FLOW_JOB_OUTPUT_BYTES,
  parseFlowJobInput,
  type FlowJobInput,
} from "./input";

export interface FlowExecutionOptions {
  signal?: AbortSignal;
  deadlineMs?: number;
  onProgress?: (completed: number, total: number) => void;
}
/** Only the bundled deterministic engine runs here. User input is data, never executable code. */
export async function executeFlowComparison(
  value: unknown,
  options: FlowExecutionOptions = {},
): Promise<Comparison> {
  let input: FlowJobInput;
  try {
    input = parseFlowJobInput(value);
  } catch (error) {
    throw new JobFault(
      "permanent",
      error instanceof Error ? error.message : "Simulationsinput er ugyldigt.",
      true,
    );
  }
  if (options.signal?.aborted)
    throw new JobFault(
      "permanent",
      "Simuleringen blev afbrudt uden eksternt forbrug.",
      true,
    );
  const deadlineMs = options.deadlineMs ?? FLOW_JOB_DEADLINE_MS;
  if (
    !Number.isInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > FLOW_JOB_DEADLINE_MS
  )
    throw new Error("Invalid bounded flow deadline.");
  return await new Promise<Comparison>((resolve, reject) => {
    let settled = false,
      completed = 0;
    const worker = new Worker(
      fileURLToPath(new URL("./bootstrap.mjs", import.meta.url)),
      {
        workerData: input,
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 256,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
      },
    );
    const finish = (result?: Comparison, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      // Completion includes native thread teardown; no calculation survives a resolved cancellation.
      void worker.terminate().then(
        () => {
          if (error) reject(error);
          else resolve(result!);
        },
        () =>
          reject(
            new JobFault(
              "permanent",
              "Simulationsprocessen kunne ikke afsluttes korrekt.",
              true,
            ),
          ),
      );
    };
    const abort = () =>
      finish(
        undefined,
        new JobFault(
          "permanent",
          "Simuleringen blev afbrudt uden eksternt forbrug.",
          true,
        ),
      );
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new JobFault(
            "permanent",
            "Simuleringen overskred serverprofilens 90 sekunder. Brug en mindre model; der er ikke godkendt et delvist resultat.",
            true,
          ),
        ),
      deadlineMs,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.on(
      "message",
      (message: {
        type?: string;
        completed?: number;
        total?: number;
        comparison?: Comparison;
        message?: string;
      }) => {
        if (settled) return;
        if (message.type === "progress") {
          if (
            !Number.isInteger(message.completed) ||
            message.completed !== completed + 1 ||
            message.total !== 30
          )
            return finish(
              undefined,
              new JobFault(
                "permanent",
                "Simuleringens fremdrift var ugyldig.",
                true,
              ),
            );
          completed = message.completed!;
          try {
            options.onProgress?.(completed, 30);
          } catch {
            finish(
              undefined,
              new JobFault(
                "permanent",
                "Simuleringens fremdrift kunne ikke registreres.",
                true,
              ),
            );
          }
        } else if (message.type === "completed") {
          try {
            const comparison = message.comparison!;
            if (
              completed !== 30 ||
              Buffer.byteLength(JSON.stringify(comparison)) >
                FLOW_JOB_OUTPUT_BYTES
            )
              throw new Error(
                "Simuleringen mangler fuldførte seedpar eller overskrider resultatgrænsen.",
              );
            assertReportReady(comparison);
            if (
              canonicalJson(comparison.baseline as unknown as Json) !==
                canonicalJson(input.baseline as unknown as Json) ||
              canonicalJson(comparison.scenario as unknown as Json) !==
                canonicalJson(input.scenario as unknown as Json) ||
              JSON.stringify(comparison.seeds) !== JSON.stringify(input.seeds)
            )
              throw new Error(
                "Resultatet matcher ikke serverjobbets låste input.",
              );
            finish(comparison);
          } catch (error) {
            finish(
              undefined,
              new JobFault(
                "permanent",
                error instanceof Error
                  ? error.message
                  : "Resultatet kunne ikke kontrolleres.",
                true,
              ),
            );
          }
        } else if (message.type === "failed")
          finish(
            undefined,
            new JobFault(
              "permanent",
              message.message?.slice(0, 2000) ||
                "Simuleringen blev ikke fuldført.",
              true,
            ),
          );
        else
          finish(
            undefined,
            new JobFault(
              "permanent",
              "Simulationsprocessen gav et ukendt svar.",
              true,
            ),
          );
      },
    );
    worker.once("error", () =>
      finish(
        undefined,
        new JobFault(
          "permanent",
          "Simulationsprocessen fejlede eller overskred sin hukommelsesgrænse. Brug en mindre model.",
          true,
        ),
      ),
    );
    worker.once("exit", () => {
      if (!settled)
        finish(
          undefined,
          new JobFault(
            "transient",
            "Simulationsprocessen lukkede før et kontrolleret resultat. Der var intet eksternt forbrug.",
            true,
          ),
        );
    });
    if (options.signal?.aborted) abort();
  });
}

export const flowComparisonHandler: JobHandler = {
  id: "flow.compare",
  costModel: "free",
  replay: { appKey: "flowlab", sideEffects: "none" },
  async run(input, context) {
    const comparison = await executeFlowComparison(input, {
      signal: context.signal,
      onProgress: context.reportProgress,
    });
    const checked = parseFlowJobInput(input);
    return {
      actualMinor: 0,
      manifest: {
        schemaVersion: 1,
        kind: "flow.comparison",
        profile: checked.profile,
        engineVersion: checked.engineVersion,
        prngVersion: checked.prngVersion,
        inputSha256: hashJson(checked as unknown as Json),
        resultSha256: hashJson(comparison as unknown as Json),
        comparison: comparison as unknown as Json,
        paidProviderCalled: false,
      },
    };
  },
};
