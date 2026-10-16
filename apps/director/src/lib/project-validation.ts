import { inspectGlb, inspectRaster, type Project } from "@tre/scene-format";
import { sha256, dataUrlBytes } from "./binary";
export async function verifyProjectMedia(project: Project) {
  const checked = new Map<
    string,
    { url: string; bytes: number; triangles: number; textureBytes: number }
  >();
  for (const scene of [...project.scenes, project.draft])
    for (const asset of scene.assets) {
      const prior = checked.get(asset.sha256);
      if (
        prior &&
        prior.url === asset.dataUrl &&
        prior.bytes === asset.bytes &&
        prior.triangles === asset.triangles &&
        prior.textureBytes === asset.textureBytes
      )
        continue;
      const bytes = dataUrlBytes(asset.dataUrl);
      if (
        bytes.length !== asset.bytes ||
        (await sha256(bytes)) !== asset.sha256
      )
        throw Error(`GLB-filen ${asset.name} matcher ikke dens checksum`);
      const info = inspectGlb(new Uint8Array(bytes).buffer);
      if (
        info.triangles !== asset.triangles ||
        info.textureBytes !== asset.textureBytes
      )
        throw Error("GLB-geometri matcher ikke manifestet");
      checked.set(asset.sha256, {
        url: asset.dataUrl,
        bytes: asset.bytes,
        triangles: asset.triangles,
        textureBytes: asset.textureBytes,
      });
    }
  for (const shot of project.shots)
    if (shot.frame) inspectRaster(dataUrlBytes(shot.frame));
  for (const media of project.media) {
    const bytes = dataUrlBytes(media.dataUrl);
    if (
      bytes.byteLength !== media.bytes ||
      (await sha256(bytes)) !== media.sha256
    )
      throw Error(`Mediefilen ${media.name} matcher ikke dens checksum`);
    if (media.kind === "image") {
      const info = inspectRaster(bytes);
      if (media.mime !== `image/${info.format}`)
        throw Error(`Billedets format matcher ikke filtypen: ${media.name}`);
    }
  }
}
