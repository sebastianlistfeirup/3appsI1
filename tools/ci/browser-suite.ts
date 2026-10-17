import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, open, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
const servers: ChildProcess[] = [];
const selected = process.env.CI_BROWSER_APP ?? "all";
if (!["all", "studio", "flowlab", "director"].includes(selected))
  throw new Error("CI_BROWSER_APP must be studio, flowlab, director or all.");
const enabled = (app: string) => selected === "all" || selected === app;
const selectedEngine = process.env.CI_BROWSER_ENGINE || "all";
if (
  !["all", "chromium", "firefox", "webkit"].includes(selectedEngine) ||
  (selectedEngine !== "all" && selected !== "flowlab")
)
  throw new Error(
    "CI_BROWSER_ENGINE may select chromium, firefox or webkit only with CI_BROWSER_APP=flowlab.",
  );
const evidence: Array<{
  command: string;
  environment: Record<string, string>;
  started: string;
  elapsedMs: number;
  outcome: string;
}> = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function run(
  command: string,
  args: string[],
  env: Record<string, string> = {},
  deadlineMs = 300000,
) {
  const label = `${command} ${args.join(" ")}`;
  const started = new Date().toISOString(),
    at = performance.now();
  let outcome = "failed";
  console.log(`[gate] Starting ${label} ${JSON.stringify(env)}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: "inherit",
        env: { ...process.env, ...env },
      });
      let timedOut = false;
      let forceStop: NodeJS.Timeout | undefined;
      const timeout = setTimeout(() => {
        timedOut = true;
        outcome = "timed_out";
        console.error(
          `[gate] ${deadlineMs / 60000}-minute deadline exceeded: ${label}`,
        );
        stop(child, "SIGTERM");
        forceStop = setTimeout(() => stop(child, "SIGKILL"), 3000);
      }, deadlineMs);
      const cleanup = () => {
        clearTimeout(timeout);
        clearTimeout(forceStop);
      };
      child.on("error", (error) => {
        cleanup();
        reject(error);
      });
      child.on("exit", (code, signal) => {
        cleanup();
        if (code === 0 && !timedOut) resolve();
        else
          reject(
            new Error(
              `${label} ${timedOut ? "timed out" : `failed (${code ?? signal})`}.`,
            ),
          );
      });
    });
    outcome = "passed";
  } finally {
    const elapsedMs = Math.round(performance.now() - at);
    evidence.push({
      command: label,
      environment: env,
      started,
      elapsedMs,
      outcome,
    });
    await writeFile(
      "reports/ci/browser-steps.json",
      JSON.stringify(
        { app: selected, engine: selectedEngine, evidence },
        null,
        2,
      ),
    );
    console.log(
      `[gate] ${outcome} in ${(elapsedMs / 1000).toFixed(1)}s: ${label}`,
    );
  }
}
async function start(app: string, port: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.on("error", () =>
      reject(
        new Error(
          `Port ${port} is in use. Stop existing app servers before this isolated browser suite.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
  const logfile = await open(`reports/ci/${app}-server.log`, "w");
  const child = spawn("pnpm", ["--filter", `@tre/${app}`, "start"], {
    detached: true,
    stdio: ["ignore", logfile.fd, logfile.fd],
    env: {
      ...process.env,
      DIRECTOR_LOCAL_RENDER: app === "director" ? "1" : undefined,
    },
  });
  servers.push(child);
  await logfile.close();
  let startupError: Error | undefined;
  child.on("error", (error) => (startupError = error));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (child.exitCode !== null)
      throw new Error(
        `${app} server exited before readiness; inspect reports/ci/${app}-server.log.`,
      );
    try {
      const response = await fetch(
        `http://${app === "director" ? "127.0.0.1" : "localhost"}:${port}/api/health`,
        { signal: AbortSignal.timeout(2000) },
      );
      if (response.ok) return;
    } catch {}
    await pause(250);
  }
  throw new Error(`${app} server did not become ready in 60 seconds.`);
}
function stop(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid)
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
}
await mkdir("reports/ci", { recursive: true });
try {
  if (enabled("studio")) {
    await run("pnpm", ["exec", "tsx", "tools/backend/check-failure-exit.ts"]);
    await run("pnpm", ["test:http"]);
    await start("studio", 3000);
    await run("pnpm", ["exec", "playwright", "test", "tests/e2e"]);
    await run("node", ["tools/browser/studio-a11y.cjs"]);
  }
  if (enabled("flowlab")) {
    if (selectedEngine === "all" || selectedEngine === "chromium")
      await run("pnpm", ["test:http", "--app=flowlab"]);
    await start("flowlab", 3001);
    for (const browser of selectedEngine === "all"
      ? ["chromium", "firefox", "webkit"]
      : [selectedEngine]) {
      await run("node", ["apps/flowlab/tests/browser-check.mjs"], {
        FLOWLAB_BROWSER: browser,
      });
      await run("node", ["apps/flowlab/tests/import-state-check.mjs"], {
        FLOWLAB_BROWSER: browser,
      });
      await run("node", ["apps/flowlab/tests/workspace-check.mjs"], {
        FLOWLAB_BROWSER: browser,
      });
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/data-history-check.ts"],
        {
          FLOWLAB_BROWSER: browser,
        },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/experiment-check.ts"],
        {
          FLOWLAB_BROWSER: browser,
        },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/case-evidence-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/run-distribution-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/scenario-library-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/csv-boundaries-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/time-profile-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/experiment-settings-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/input-differences-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/arrival-editor-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/resource-editor-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/cost-profile-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/templates-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
      await run(
        "pnpm",
        ["exec", "tsx", "apps/flowlab/tests/diagram-routing-check.ts"],
        { FLOWLAB_BROWSER: browser },
      );
    }
    if (selectedEngine === "all" || selectedEngine === "chromium") {
      await run("node", ["apps/flowlab/tests/journey-check.mjs"]);
      await run("node", ["apps/flowlab/tests/canvas-check.mjs"]);
      await run("node", ["apps/flowlab/tests/accessibility-check.mjs"]);
      await run("pnpm", ["exec", "tsx", "apps/flowlab/tests/holdout-check.ts"]);
      await run("pnpm", [
        "exec",
        "tsx",
        "apps/flowlab/tests/report-layout-check.ts",
      ]);
      await run("node", ["apps/flowlab/tests/edge-results-check.mjs"]);
    }
  }
  if (enabled("director")) {
    await start("director", 3002);
    await run("node", ["apps/director/tests/cross-browser.mjs"]);
    for (const browser of ["chromium", "firefox", "webkit"]) {
      await run("node", ["apps/director/tests/textured-glb-flow.mjs"], {
        GLB_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/library-flow.mjs"], {
        LIBRARY_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/large-library-flow.mjs"], {
        LIBRARY_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/archive-flow.mjs"], {
        ARCHIVE_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/storyboard-flow.mjs"], {
        STORYBOARD_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/versions-flow.mjs"], {
        VERSIONS_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/locations-flow.mjs"], {
        LOCATION_ENGINE: browser,
      });
      await run("node", ["apps/director/tests/media-lifecycle-flow.mjs"], {
        LIFECYCLE_ENGINE: browser,
      });
      await run(
        "node",
        ["--import", "tsx", "apps/director/tests/render-history-ui-flow.mjs"],
        { HISTORY_ENGINE: browser },
      );
      await run(
        "node",
        ["--import", "tsx", "apps/director/tests/captions-ui-flow.mjs"],
        {
          CAPTION_ENGINE: browser,
        },
      );
      await run(
        "node",
        ["apps/director/tests/render-profile-ui-flow.mjs"],
        { PROFILE_ENGINE: browser },
        240000,
      );
    }
    await run("node", ["apps/director/tests/editor-flow.mjs"]);
    await run("node", ["apps/director/tests/storage-recovery.mjs"]);
    await run("node", ["apps/director/tests/a11y-smoke.mjs"]);
    await run("node", ["apps/director/tests/render-smoke.mjs"]);
    await run("node", ["apps/director/tests/recovery-smoke.mjs"]);
    await run("node", [
      "--import",
      "tsx",
      "apps/director/tests/sequence-render-smoke.mjs",
    ]);
    await run("node", ["apps/director/tests/media-ui-flow.mjs"]);
    for (const browser of ["firefox", "webkit"])
      await run("node", ["apps/director/tests/media-ui-flow.mjs"], {
        MEDIA_ENGINE: browser,
        DIRECTOR_SKIP_RENDER: "1",
      });
    await run("node", ["apps/director/tests/clip-audio-smoke.mjs"]);
    await run(
      "node",
      ["--import", "tsx", "apps/director/tests/caption-render-smoke.mjs"],
      {},
      360000,
    );
    await run("node", ["apps/director/tests/cancellation-smoke.mjs"]);
    await run(
      "node",
      ["--import", "tsx", "apps/director/tests/render-profile-smoke.mjs"],
      {},
      120000,
    );
    await run(
      "node",
      ["--import", "tsx", "apps/director/tests/render-history-smoke.mjs"],
      {},
      180000,
    );
  }
} finally {
  for (const server of servers) stop(server, "SIGTERM");
  await pause(500);
  for (const server of servers)
    if (server.exitCode === null) stop(server, "SIGKILL");
}
