import { after } from "next/server";
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
  return Response.json(
    {
      available: localRenderAvailable(request),
      profile: "local-only",
      cloudConnected: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
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
