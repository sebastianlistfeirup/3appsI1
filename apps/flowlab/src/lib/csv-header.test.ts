import { expect, it } from "vitest";
import { readCsvHeader } from "./csv-header";

it("reads the complete broad header and ignores delimiter characters inside quoted names", async () => {
  const headers = [
    ...Array.from({ length: 80 }, (_, i) => `extra;${i}-${"æ".repeat(80)}`),
    "case_id",
    "started_at",
  ];
  const csv =
    headers.map((header) => `"${header}"`).join(",") +
    "\r\n" +
    headers.map(() => "value").join(",");
  expect(new TextEncoder().encode(csv.split("\r")[0]).length).toBeGreaterThan(
    4096,
  );
  expect(await readCsvHeader(new Blob([csv]))).toEqual({
    headers,
    delimiter: ",",
  });
});

it("accepts the maximum number of maximum-length Unicode headers beyond 4 KB", async () => {
  const headers = Array.from(
    { length: 1000 },
    (_, i) => `字${String(i).padStart(4, "0")}${"界".repeat(195)}`,
  );
  const csv = new Blob([headers.join(";") + "\n", "x".repeat(2 * 1024 * 1024)]);
  const result = await readCsvHeader(csv);
  expect(result.headers).toEqual(headers);
  expect(result.delimiter).toBe(";");
});

it("handles quoted BOM headers and headers-only files without reading an unfinished data field", async () => {
  expect(await readCsvHeader(new Blob(['\uFEFF"case_id",started_at']))).toEqual(
    { headers: ["case_id", "started_at"], delimiter: "," },
  );
  expect(
    await readCsvHeader(new Blob(['case_id,started_at\na,"unfinished data'])),
  ).toEqual({ headers: ["case_id", "started_at"], delimiter: "," });
});

it("reports actual malformed headers, invalid UTF-8 and oversized records", async () => {
  await expect(readCsvHeader(new Blob([]))).rejects.toThrow("tom");
  await expect(
    readCsvHeader(new Blob(['"case_id,started_at'])),
  ).rejects.toThrow("uafsluttet");
  await expect(
    readCsvHeader(new Blob(['"\ncase_id",started_at\na,0'])),
  ).rejects.toThrow("kontroltegn");
  await expect(
    readCsvHeader(new Blob([new Uint8Array([0xff, 0xfe, 0x0a])])),
  ).rejects.toThrow("UTF-8");
  await expect(
    readCsvHeader(new Blob(["a".repeat(1024 * 1024 + 1)])),
  ).rejects.toThrow("for lang");
});

it("does not reject a valid UTF-8 sequence split at the prefix byte boundary", async () => {
  const header = "case_id,started_at\n",
    prefix = header + "a".repeat(1024 * 1024 - header.length - 1);
  expect(await readCsvHeader(new Blob([prefix, "😀"]))).toEqual({
    headers: ["case_id", "started_at"],
    delimiter: ",",
  });
});
