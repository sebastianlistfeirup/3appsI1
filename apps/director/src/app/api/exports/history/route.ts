import {
  localRenderAvailable,
  renderHistory,
} from "../../../../lib/server/local-render";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!localRenderAvailable(request))
    return Response.json(
      { error: "Eksportarkivet findes kun på din lokale render-server" },
      { status: 403 },
    );
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !/^[a-zA-Z0-9_-]{1,100}$/.test(projectId))
    return Response.json(
      { error: "Et gyldigt projekt-id kræves" },
      { status: 400 },
    );
  try {
    return Response.json(await renderHistory(projectId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Det lokale eksportarkiv kunne ikke læses. Projektet er bevaret.",
      },
      { status: 500 },
    );
  }
}
