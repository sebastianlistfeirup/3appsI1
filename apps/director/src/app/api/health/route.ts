export function GET() {
  return Response.json({
    status: "ok",
    app: "director",
    profile: "demo",
    version: "0.1.0",
  });
}
