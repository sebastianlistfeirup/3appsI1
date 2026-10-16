import {
  importWorkspace,
  MAX_WORKSPACE_BYTES,
  serializeWorkspace,
  workspaceError,
} from "../lib/workspace";
import type { FlowDocument } from "../lib/document";
self.onmessage = async (
  event: MessageEvent<
    { type: "import"; file: File } | { type: "export"; document: FlowDocument }
  >,
) => {
  try {
    if (event.data.type === "import") {
      if (event.data.file.size > MAX_WORKSPACE_BYTES)
        throw new Error("Modelpakken må højst være 128 MB.");
      const document = importWorkspace(await event.data.file.text());
      self.postMessage({ type: "imported", document });
    } else {
      const bytes = new TextEncoder().encode(
        serializeWorkspace(event.data.document),
      );
      self.postMessage(
        { type: "exported", bytes },
        { transfer: [bytes.buffer] },
      );
    }
  } catch (error) {
    self.postMessage({ type: "error", message: workspaceError(error) });
  }
};
