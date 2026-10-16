export function inspectRaster(bytes: Uint8Array): {
  width: number;
  height: number;
  format: "png" | "jpeg";
} {
  let width = 0,
    height = 0;
  let format: "png" | "jpeg" = "png";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
      throw Error("PNG IHDR mangler");
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    format = "jpeg";
    let offset = 2;
    while (offset < bytes.length - 3) {
      if (bytes[offset] !== 255) throw Error("Ugyldig JPEG-markør");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length)
        throw Error("Ugyldig JPEG-længde");
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw Error("Ugyldigt JPEG-frame");
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else throw Error("Kun ægte PNG- og JPEG-billeder understøttes");
  if (!width || !height)
    throw Error("Billedets dimensioner kunne ikke aflæses");
  if (width > 8192 || height > 8192 || width * height > 32_000_000)
    throw Error(
      "Billedet må højst være 8192 pixels på hver led og 32 megapixels",
    );
  return { width, height, format };
}
