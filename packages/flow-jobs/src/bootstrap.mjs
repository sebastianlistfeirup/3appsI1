// Explicit registration is required in worker threads: Node's native .ts stripping
// otherwise bypasses tsx resolution for the workspace's extensionless imports.
import { register } from "tsx/esm/api";
const unregister = register();
try {
  await import("./thread.ts");
} finally {
  await unregister();
}
