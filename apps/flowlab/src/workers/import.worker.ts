import {
  createCsvImporter,
  inferDelimiter,
  type CsvMapping,
} from "@tre/flow-engine";
let cancelled = false;
self.onmessage = async (
  event: MessageEvent<{
    type: "import" | "cancel";
    file: File;
    mapping?: CsvMapping;
    unit: "iso" | "seconds" | "minutes";
  }>,
) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }
  cancelled = false;
  try {
    const { file, mapping, unit } = event.data;
    if (file.size > 10 * 1024 * 1024) throw new Error("CSV-grænsen er 10 MB.");
    const prefix = await file.slice(0, 4096).text(),
      importer = createCsvImporter({
        mapping,
        unit,
        delimiter: inferDelimiter(prefix),
      }),
      reader = file.stream().getReader(),
      decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    while (true) {
      if (cancelled) {
        await reader.cancel();
        self.postMessage({ type: "cancelled" });
        return;
      }
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      importer.write(decoder.decode(chunk.value, { stream: true }));
      self.postMessage({ type: "progress", progress: bytes / file.size });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    importer.write(decoder.decode());
    const result = importer.finish();
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const sha256 = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    self.postMessage({ type: "result", result, sha256 });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof TypeError
          ? "Filen indeholder ugyldig UTF-8. Gem CSV-filen som UTF-8, og prøv igen."
          : error instanceof Error
            ? error.message
            : "Filen kunne ikke læses.",
    });
  }
};
