import "server-only";
import { createBackendHandler, disconnectedBackend } from "@tre/backend";
import { Pool } from "@tre/database";
import { supabaseAuthConfig } from "@tre/auth";
import {
  newProjectDocument,
  validateProjectDocument,
  validateProjectDocumentUpdate,
} from "@/lib/cloud-document";

type Handler = ReturnType<typeof createBackendHandler>;
const globalBackend = globalThis as typeof globalThis & {
  __treStudioBackend?: Handler;
};
/** Opt-in server profile. Local demo data is never uploaded implicitly. */
export async function studioBackend(request: Request): Promise<Response> {
  if (process.env.TRE_BACKEND_ENABLED !== "1") return disconnectedBackend();
  if (!globalBackend.__treStudioBackend) {
    try {
      const connectionString = process.env.APP_DATABASE_URL,
        identityOrigin = process.env.SUPABASE_URL;
      if (!connectionString || !identityOrigin) return disconnectedBackend();
      const auth = supabaseAuthConfig(identityOrigin);
      const pool = new Pool({
        connectionString,
        max: 6,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        statement_timeout: 10000,
        idle_in_transaction_session_timeout: 10000,
      });
      pool.on("error", () =>
        console.error(
          JSON.stringify({ type: "backend.pool_unavailable", app: "studio" }),
        ),
      );
      globalBackend.__treStudioBackend = createBackendHandler({
        pool,
        auth,
        app: "studio",
        createDocument: newProjectDocument,
        validateDocument: validateProjectDocument,
        validateUpdate: validateProjectDocumentUpdate,
        log: (event) =>
          console.info(
            JSON.stringify({ type: "backend.request_rejected", ...event }),
          ),
      });
    } catch {
      return disconnectedBackend();
    }
  }
  return globalBackend.__treStudioBackend(request);
}
