"use client";
import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { downloadFile } from "@tre/persistence";
import type { Project } from "../lib/model";
import { exportRunPackageFile } from "../lib/run-package-client";

export function RunPackageButton({
  project,
  runId,
  notify,
}: {
  project: Project;
  runId: string;
  notify: (message: string, error?: boolean) => void;
}) {
  const [progress, setProgress] = useState<string>();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setProgress("Forbereder arbejdspakke…");
    try {
      const bytes = await exportRunPackageFile(
        project,
        runId,
        controller.signal,
        (value) => {
          if (!controller.signal.aborted)
            setProgress(
              value.phase === "packing"
                ? "Pakker de låste input…"
                : `Kontrollerer input ${value.completed + 1} af ${value.total}…`,
            );
        },
      );
      if (controller.signal.aborted) return;
      downloadFile(
        `arbejdspakke-${runId}.zip`,
        new Blob([Uint8Array.from(bytes).buffer], { type: "application/zip" }),
      );
      notify(
        "Arbejdspakken er hentet med den låste aftale og de valgte originaler.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        notify(
          error instanceof Error
            ? error.message
            : "Arbejdspakken kunne ikke hentes.",
          true,
        );
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setProgress(undefined);
    }
  }
  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setProgress(undefined);
  }
  return (
    <div className="run-package-action">
      <button
        type="button"
        className="button secondary"
        onClick={() => void download()}
        disabled={Boolean(progress)}
      >
        {progress ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Download size={16} />
        )}{" "}
        Hent arbejdspakke
      </button>
      {progress && (
        <>
          <span role="status">{progress}</span>
          <button
            type="button"
            className="icon-button"
            onClick={cancel}
            aria-label="Afbryd arbejdspakke"
          >
            <X size={16} />
          </button>
        </>
      )}
    </div>
  );
}
