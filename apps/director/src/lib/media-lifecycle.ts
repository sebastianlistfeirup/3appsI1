export type MediaTaskOptions = { signal?: AbortSignal; timeoutMs?: number };

export function mediaAbort(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error && signal.reason.name !== "AbortError"
    ? signal.reason
    : new DOMException(
        "Medieimporten er afbrudt. Projektet er bevaret.",
        "AbortError",
      );
}
export function checkMediaAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw mediaAbort(signal);
}

/** FileReader is cancellable; Blob.arrayBuffer() is not. */
export function readMediaFile(
  file: Blob,
  mode: "bytes",
  options?: MediaTaskOptions,
): Promise<ArrayBuffer>;
export function readMediaFile(
  file: Blob,
  mode: "url",
  options?: MediaTaskOptions,
): Promise<string>;
export function readMediaFile(
  file: Blob,
  mode: "bytes" | "url",
  { signal, timeoutMs = 15000 }: MediaTaskOptions = {},
): Promise<ArrayBuffer | string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(mediaAbort(signal));
    const reader = new FileReader();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reader.onload = reader.onerror = reader.onabort = null;
      const result = reader.result;
      if (reader.readyState === FileReader.LOADING) reader.abort();
      if (error) reject(error);
      else if (typeof result === "string" || result instanceof ArrayBuffer)
        resolve(result);
      else reject(Error("Filen kunne ikke læses"));
    };
    const cancel = () => finish(mediaAbort(signal));
    const timer = setTimeout(
      () => finish(Error("Filen kunne ikke læses inden 15 sekunder")),
      timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    reader.onload = () => finish();
    reader.onerror = () => finish(Error("Filen kunne ikke læses"));
    reader.onabort = cancel;
    try {
      if (mode === "bytes") reader.readAsArrayBuffer(file);
      else reader.readAsDataURL(file);
    } catch (error) {
      finish(error instanceof Error ? error : Error("Filen kunne ikke læses"));
    }
  });
}

/** All ownership (source, listeners and decoder) ends before this promise settles. */
export function withDecodedImage<T>(
  src: string,
  consume: (image: HTMLImageElement) => T,
  { signal, timeoutMs = 15000 }: MediaTaskOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(mediaAbort(signal));
    const image = new Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      image.onload = image.onerror = null;
      try {
        if (error) throw error;
        resolve(consume(image));
      } catch (error) {
        reject(error);
      } finally {
        image.removeAttribute("src");
      }
    };
    const cancel = () => finish(mediaAbort(signal));
    const timer = setTimeout(
      () => finish(Error("Billedet kunne ikke afkodes inden 15 sekunder")),
      timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(Error("Billedet kunne ikke åbnes"));
    image.src = src;
  });
}

export function releaseMediaElement(element: HTMLMediaElement) {
  element.pause();
  element.removeAttribute("src");
  element.load();
}

export function probeMedia(
  file: Blob,
  kind: "audio" | "video",
  { signal, timeoutMs = 10000 }: MediaTaskOptions = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(mediaAbort(signal));
    const element = document.createElement(kind),
      url = URL.createObjectURL(file);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      const duration = element.duration;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      element.onloadedmetadata = element.onerror = null;
      releaseMediaElement(element);
      element.remove();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else if (
        !Number.isFinite(duration) ||
        duration < 1 / 24 ||
        duration > 3600
      )
        reject(Error("Mediets varighed kan ikke bruges"));
      else resolve(Math.floor(duration * 24));
    };
    const cancel = () => finish(mediaAbort(signal));
    const timer = setTimeout(
      () => finish(Error("Mediet kunne ikke aflæses inden 10 sekunder")),
      timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    element.preload = "metadata";
    element.onloadedmetadata = () => finish();
    element.onerror = () => {
      console.warn(
        "Director media import failed",
        JSON.stringify({
          mime: file.type,
          code: element.error?.code,
          message: element.error?.message,
          networkState: element.networkState,
          readyState: element.readyState,
        }),
      );
      finish(Error("Browseren kan ikke åbne dette medie"));
    };
    element.src = url;
  });
}

/** Cannot stop Three's native parse, but no abandoned result keeps GPU/bitmap resources. */
export function boundedMediaStep<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  discard?: (result: T) => void,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(mediaAbort(signal));
      }
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(Error("Mediet kunne ikke behandles inden 15 sekunder"));
      }
    }, timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    promise.then(
      (result) => {
        if (settled) {
          discard?.(result);
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      },
      (error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      },
    );
  });
}
