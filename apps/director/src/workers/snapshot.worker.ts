/// <reference lib="webworker" />
import { parseProject } from "@tre/scene-format";
import { sha256 } from "../lib/binary";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const project = parseProject(event.data);
    self.postMessage({
      hash: await sha256(new TextEncoder().encode(JSON.stringify(project))),
    });
  } catch {
    self.postMessage({
      error: "Det aktuelle snapshot kunne ikke sammenlignes",
    });
  }
};
