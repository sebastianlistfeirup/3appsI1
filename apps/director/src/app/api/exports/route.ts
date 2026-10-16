import { after } from "next/server";
import { renderCapability } from "../../../lib/server/render-profile";
import {
  claimRenderInput,
  releaseRenderInput,
  createRender,
  executeRender,
  localRenderAvailable,
  readBoundedJson,
} from "../../../lib/server/local-render";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const capability = localRenderAvailable(request)
    ? await renderCapability(
        new URL(request.url).searchParams.get("refresh") === "1",
      )
    : {
        available: false,
        profile: "local-only",
        cloudConnected: false,
        reason: "Lokal render er ikke aktiveret for denne forbindelse",
      };
  return Response.json(capability, {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  if (!localRenderAvailable(request))
    return Response.json(
      {
        error:
          "Lokal render er ikke aktiveret for denne forbindelse. Serveren skal køre på loopback med DIRECTOR_LOCAL_RENDER=1.",
      },
      { status: 403 },
    );
  if (!claimRenderInput())
    return Response.json(
      { error: "En lokal eksport er allerede i gang." },
      { status: 429 },
    );
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "JSON-manifest kræves" }, { status: 415 });
    const capability = await renderCapability();
    if (!capability.available)
      return Response.json(
        { error: capability.reason, capability },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    const input = await readBoundedJson(request);
    const state = await createRender(input.project);
    after(() => executeRender(state.id));
    return Response.json(state, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ugyldigt manifest" },
      { status: 400 },
    );
  } finally {
    releaseRenderInput();
  }
}
