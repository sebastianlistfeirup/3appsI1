"use client";
import { useEffect, useRef, useState } from "react";
export function useMediaTask() {
  const task = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [active, setActive] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      task.current?.abort();
    };
  }, []);
  return {
    active,
    cancel: () => task.current?.abort(),
    async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (task.current) throw Error("Et medie behandles allerede");
      const controller = new AbortController();
      task.current = controller;
      setActive(true);
      const deadline = setTimeout(
        () =>
          controller.abort(
            Error("Medieimporten overskred 45 sekunder. Projektet er bevaret."),
          ),
        45000,
      );
      try {
        return await fn(controller.signal);
      } finally {
        clearTimeout(deadline);
        if (task.current === controller) task.current = null;
        if (mounted.current) setActive(false);
      }
    },
  };
}
