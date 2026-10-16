import {
  CsvParser,
  inferDelimiter,
  normalizeCsvHeaders,
} from "@tre/flow-engine";

// 1,000 headers × 200 UTF-16 units fit below this bound, including UTF-8,
// escaped quotes and delimiters. Never parse a truncated first record.
const HEADER_READ_BYTES = 1024 * 1024;
export async function readCsvHeader(
  file: Blob,
): Promise<{ headers: string[]; delimiter: string }> {
  if (!file.size) throw new Error("CSV-filen er tom.");
  const prefix = file.slice(0, HEADER_READ_BYTES);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await prefix.arrayBuffer(),
      {
        stream: prefix.size < file.size,
      },
    );
  } catch {
    throw new Error(
      "Filen kunne ikke læses som UTF-8. Gem CSV-filen som UTF-8, og prøv igen.",
    );
  }
  let quoted = false,
    end = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (text[i] === "\r" || text[i] === "\n")) {
      end = i;
      break;
    }
  }
  if (end === -1 && prefix.size < file.size)
    throw new Error(
      "Kolonneoverskriften er for lang eller har et uafsluttet anførselstegn.",
    );
  const header = end === -1 ? text : text.slice(0, end),
    delimiter = inferDelimiter(header);
  let headers: string[] = [];
  const parser = new CsvParser(delimiter, (row) => {
    headers = normalizeCsvHeaders(row);
  });
  parser.write(header);
  parser.finish();
  if (!headers.length) throw new Error("Alle kolonner skal have et navn.");
  return { headers, delimiter };
}
