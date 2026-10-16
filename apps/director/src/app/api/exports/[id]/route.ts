import { after } from "next/server";
import {
  cancelRender,
  executeRender,
  getRender,
  isRenderActive,
  localRenderAvailable,
  movieFile,
  reserveResume,
  renderArtifact,
} from "../../../../lib/server/local-render";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!localRenderAvailable(request))
    return Response.json({ error: "Kun til lokal render" }, { status: 403 });
  try {
    const { id } = await context.params;
    const state = await getRender(id);
    const artifact = new URL(request.url).searchParams.get("artifact");
    if (artifact) {
      const file = await renderArtifact(id, artifact);
      return new Response(new Uint8Array(file), {
        headers: {
          "Content-Type": artifact.endsWith(".json")
            ? "application/json; charset=utf-8"
            : artifact.endsWith(".vtt")
              ? "text/vtt; charset=utf-8"
              : "application/x-subrip; charset=utf-8",
          "Content-Disposition": `attachment; filename="director-${id.slice(0, 8)}-${artifact}"`,
          "Cache-Control": "private, no-store",
          "Content-Length": String(file.length),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (new URL(request.url).searchParams.get("download") === "1") {
      const file = await movieFile(id);
      return new Response(new Uint8Array(file), {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="director-${id.slice(0, 8)}.mp4"`,
          "Cache-Control": "private, no-store",
          "Content-Length": String(file.length),
        },
      });
    }
    if (
      ["queued", "running", "validating"].includes(state.state) &&
      !isRenderActive(id) &&
      reserveResume(id)
    )
      after(() => executeRender(id));
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Eksporten findes ikke eller er endnu ikke færdig" },
      { status: 404 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!localRenderAvailable(request))
    return Response.json({ error: "Kun til lokal render" }, { status: 403 });
  try {
    const { id } = await context.params;
    return Response.json(await cancelRender(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Eksporten findes ikke" }, { status: 404 });
  }
}
