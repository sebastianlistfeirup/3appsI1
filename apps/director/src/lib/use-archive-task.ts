"use client";
import { useEffect, useRef, useState } from "react";
import { archiveProgressLabel, type ArchiveOptions } from "./archive-client";
export function useArchiveTask(onProgress: (message: string) => void) {
  const controller = useRef<AbortController | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  return {
    active,
    cancel: () => controller.current?.abort(),
    async run<T>(task: (options: ArchiveOptions) => Promise<T>): Promise<T> {
      if (controller.current) throw Error("En projektpakke behandles allerede");
      const current = new AbortController();
      controller.current = current;
      setActive(true);
      try {
        return await task({
          signal: current.signal,
          onProgress: (value) => onProgress(archiveProgressLabel(value)),
        });
      } finally {
        if (controller.current === current) {
          controller.current = null;
          setActive(false);
        }
      }
    },
  };
}
