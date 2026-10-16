import { inspectRaster } from "@tre/scene-format";

export const MAX_LIBRARY_THUMBNAIL_CHARS = 64 * 1024;
/** Decode one bounded local source at a time; summaries retain only a small derivative. */
export async function libraryThumbnail(
  source: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) throw new DOMException("Afbrudt", "AbortError");
  let url: string;
  try {
    if (
      !/^data:image\/(png|jpeg);base64,/.test(source) ||
      source.length > 70_000_000
    )
      return null;
    const decoded = atob(source.slice(source.indexOf(",") + 1)),
      bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++)
      bytes[index] = decoded.charCodeAt(index);
    const info = inspectRaster(bytes);
    url = URL.createObjectURL(
      new Blob([bytes], { type: `image/${info.format}` }),
    );
  } catch {
    return null;
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    let complete = false;
    const finish = (thumbnail: string | null, aborted = false) => {
      if (complete) return;
      complete = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      image.onload = image.onerror = null;
      image.src = "";
      URL.revokeObjectURL(url);
      if (aborted) reject(new DOMException("Afbrudt", "AbortError"));
      else resolve(thumbnail);
    };
    const cancel = () => finish(null, true),
      timeout = setTimeout(() => finish(null), 5000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) return cancel();
    image.onerror = () => finish(null);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      try {
        canvas.width = 384;
        canvas.height = 216;
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.fillStyle = "#161a22";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.max(
          canvas.width / image.naturalWidth,
          canvas.height / image.naturalHeight,
        );
        context.drawImage(
          image,
          (canvas.width - image.naturalWidth * scale) / 2,
          (canvas.height - image.naturalHeight * scale) / 2,
          image.naturalWidth * scale,
          image.naturalHeight * scale,
        );
        for (const quality of [0.65, 0.45, 0.25]) {
          const thumbnail = canvas.toDataURL("image/jpeg", quality);
          if (thumbnail.length <= MAX_LIBRARY_THUMBNAIL_CHARS)
            return finish(thumbnail);
        }
        finish(null);
      } catch {
        finish(null);
      } finally {
        canvas.width = canvas.height = 0;
      }
    };
    image.src = url;
  });
}
