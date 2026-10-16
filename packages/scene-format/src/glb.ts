export interface GlbInspection {
  /** Includes mesh instances in the selected default scene. */
  triangles: number;
  textureCount: number;
  meshCount: number;
  nodeCount: number;
  warnings: string[];
}
const integer = (n: unknown): n is number =>
  Number.isInteger(n) && Number(n) >= 0;
const record = (n: unknown): n is Record<string, any> =>
  !!n && typeof n === "object" && !Array.isArray(n);
const finiteVector = (value: unknown, size: number, limit = 1_000_000) =>
  Array.isArray(value) &&
  value.length === size &&
  value.every(
    (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit,
  );

/** Bounded static, embedded-only GLB 2.0 subset. Validate before allocating GPU buffers.
 * No network, plugins, animation, rigs, textures or arbitrary application extensions.
 */
export function inspectGlb(buffer: ArrayBuffer): GlbInspection {
  if (buffer.byteLength > 50 * 1024 * 1024)
    throw Error("GLB må højst være 50 MB");
  if (buffer.byteLength < 20) throw Error("GLB-header mangler");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw Error("Ugyldig GLB 2.0-fil");
  const length = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    length > buffer.byteLength - 20 ||
    length > 2 * 1024 * 1024 ||
    length % 4 !== 0
  )
    throw Error("GLB JSON-chunk mangler eller er for stor");
  let data: Record<string, any>;
  try {
    data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(buffer, 20, length),
      ),
    );
  } catch {
    throw Error("Ugyldige GLB-metadata");
  }
  if (!record(data)) throw Error("Ugyldige GLB-metadata");
  for (const key of [
    "buffers",
    "images",
    "textures",
    "animations",
    "skins",
    "scenes",
    "nodes",
    "meshes",
    "accessors",
    "bufferViews",
    "materials",
  ]) {
    if (
      data[key] !== undefined &&
      (!Array.isArray(data[key]) ||
        data[key].length > 1000 ||
        data[key].some((v: unknown) => !record(v)))
    )
      throw Error("GLB indeholder ugyldige elementlister");
  }
  if (data.asset?.version !== "2.0")
    throw Error("Modellen skal bruge glTF 2.0");
  if (
    data.extensionsRequired?.length ||
    data.extensionsUsed?.length ||
    data.extensions
  )
    throw Error("GLB-udvidelser understøttes ikke i standardprofilen");
  if (
    data.buffers?.some((b: any) => b.uri !== undefined) ||
    data.images?.some((i: any) => i.uri !== undefined)
  )
    throw Error("Eksterne teksturer og buffer-URLer er ikke tilladt");
  if (data.images?.length || data.textures?.length)
    throw Error(
      "Teksturerede GLB-filer kræver en billedvalidator og kan endnu ikke importeres",
    );
  if (data.animations?.length || data.skins?.length)
    throw Error(
      "Animation og rigs er ikke understøttet i statiske GLB-importer",
    );
  // Extensions must also be absent from nested objects even if not declared at the root.
  const metadata = JSON.stringify(data);
  if (/"extensions"\s*:/.test(metadata))
    throw Error("GLB-udvidelser understøttes ikke i standardprofilen");
  const binaryHeader = 20 + length;
  if (
    binaryHeader + 8 > buffer.byteLength ||
    view.getUint32(binaryHeader + 4, true) !== 0x004e4942
  )
    throw Error("GLB-binærdata mangler");
  const binaryLength = view.getUint32(binaryHeader, true),
    binaryStart = binaryHeader + 8;
  if (
    binaryStart + binaryLength !== buffer.byteLength ||
    binaryLength % 4 !== 0
  )
    throw Error("Ugyldig GLB-binærchunk");
  if (
    !Array.isArray(data.buffers) ||
    data.buffers.length !== 1 ||
    !integer(data.buffers[0].byteLength) ||
    data.buffers[0].byteLength > binaryLength ||
    binaryLength - data.buffers[0].byteLength > 3
  )
    throw Error("Ugyldig GLB-buffer");
  for (const b of data.bufferViews ?? []) {
    if (
      b.buffer !== 0 ||
      !integer(b.byteLength) ||
      !integer(b.byteOffset ?? 0) ||
      (b.byteOffset ?? 0) + b.byteLength > data.buffers[0].byteLength
    )
      throw Error("GLB-buffer ligger uden for filen");
    if (
      b.byteStride !== undefined &&
      (!integer(b.byteStride) ||
        b.byteStride < 4 ||
        b.byteStride > 252 ||
        b.byteStride % 4 !== 0)
    )
      throw Error("Ugyldigt GLB-stride");
  }
  const sizes: Record<number, number> = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
  };
  const components: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
  };
  let allocatedBytes = 0;
  for (const a of data.accessors ?? []) {
    if (a.sparse) throw Error("Sparse GLB-accessors understøttes ikke");
    const b = data.bufferViews?.[a.bufferView],
      size = sizes[a.componentType],
      count = components[a.type];
    if (
      !integer(a.bufferView) ||
      !b ||
      !size ||
      !count ||
      !integer(a.count) ||
      a.count > 300000 ||
      !integer(a.byteOffset ?? 0)
    )
      throw Error("Ugyldig eller for stor GLB-accessor");
    const stride = b.byteStride ?? size * count;
    const end =
      (a.byteOffset ?? 0) +
      (a.count ? stride * (a.count - 1) + size * count : 0);
    if (
      stride < size * count ||
      end > b.byteLength ||
      (a.byteOffset ?? 0) % size !== 0 ||
      ((b.byteOffset ?? 0) + (a.byteOffset ?? 0)) % size !== 0
    )
      throw Error(
        "GLB-accessor ligger uden for bufferen eller er forkert justeret",
      );
    allocatedBytes += a.count * count * size;
    if (allocatedBytes > 64 * 1024 * 1024)
      throw Error("GLB-geometrien kræver for meget hukommelse");
    for (const key of ["min", "max"])
      if (a[key] !== undefined && !finiteVector(a[key], count))
        throw Error("Ugyldige GLB-grænser");
  }
  const meshes = data.meshes ?? [];
  if (!meshes.length || meshes.length > 64)
    throw Error("GLB kræver mellem 1 og 64 meshes");
  const checkedFloats = new Set<number>();
  const meshTriangles = meshes.map((mesh: any) => {
    if (
      !Array.isArray(mesh.primitives) ||
      !mesh.primitives.length ||
      mesh.primitives.length > 100
    )
      throw Error("Ugyldige GLB-primitiver");
    let count = 0;
    for (const p of mesh.primitives) {
      if (!record(p) || (p.mode !== undefined && p.mode !== 4))
        throw Error("Kun GLB-trekanter understøttes");
      if (p.targets || mesh.weights)
        throw Error("Morph targets understøttes ikke");
      if (!record(p.attributes) || !integer(p.attributes.POSITION))
        throw Error("Ugyldig GLB-geometri");
      const position = data.accessors?.[p.attributes.POSITION];
      if (
        !position ||
        position.type !== "VEC3" ||
        position.componentType !== 5126
      )
        throw Error("GLB-positioner skal være float32 VEC3");
      for (const [semantic, index] of Object.entries(p.attributes)) {
        if (
          ![
            "POSITION",
            "NORMAL",
            "TANGENT",
            "TEXCOORD_0",
            "TEXCOORD_1",
            "COLOR_0",
          ].includes(semantic) ||
          !integer(index)
        )
          throw Error("Ugyldig GLB-vertexattribut");
        const a = data.accessors[index];
        if (!a || a.count !== position.count)
          throw Error("GLB-attributter skal have samme antal vertices");
        const expected = semantic.startsWith("TEXCOORD")
          ? ["VEC2"]
          : semantic === "TANGENT"
            ? ["VEC4"]
            : semantic === "COLOR_0"
              ? ["VEC3", "VEC4"]
              : ["VEC3"];
        if (!expected.includes(a.type)) throw Error("Ugyldig GLB-attributtype");
        if (a.componentType === 5126 && !checkedFloats.has(index)) {
          const b = data.bufferViews[a.bufferView],
            width = components[a.type],
            stride = b.byteStride ?? width * 4;
          const start = binaryStart + (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
          for (let i = 0; i < a.count; i++)
            for (let axis = 0; axis < width; axis++) {
              const n = view.getFloat32(start + i * stride + axis * 4, true);
              if (!Number.isFinite(n) || Math.abs(n) > 1_000_000)
                throw Error(
                  "GLB indeholder ugyldige positioner eller attributter",
                );
            }
          checkedFloats.add(index);
        }
      }
      const a = data.accessors[p.indices ?? p.attributes.POSITION];
      if (!a || a.count % 3 !== 0) throw Error("Ugyldig GLB-trekantsgeometri");
      count += a.count / 3;
      if (p.indices !== undefined) {
        if (
          !integer(p.indices) ||
          a.type !== "SCALAR" ||
          ![5121, 5123, 5125].includes(a.componentType)
        )
          throw Error("Ugyldige trekantsindekser");
        const b = data.bufferViews[a.bufferView],
          size = sizes[a.componentType],
          start = binaryStart + (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
        for (let i = 0; i < a.count; i++) {
          const at = start + i * (b.byteStride ?? size),
            n =
              size === 1
                ? view.getUint8(at)
                : size === 2
                  ? view.getUint16(at, true)
                  : view.getUint32(at, true);
          if (n >= position.count)
            throw Error("GLB-indeks refererer uden for geometrien");
        }
      }
      if (
        p.material !== undefined &&
        (!integer(p.material) || !data.materials?.[p.material])
      )
        throw Error("GLB-materiale mangler");
    }
    return count;
  });
  for (const material of data.materials ?? []) {
    for (const key of ["normalTexture", "occlusionTexture", "emissiveTexture"])
      if (material[key] !== undefined)
        throw Error("Teksturer understøttes ikke");
    const pbr = material.pbrMetallicRoughness;
    if (pbr !== undefined && !record(pbr))
      throw Error("Ugyldigt GLB-materiale");
    if (pbr?.baseColorTexture || pbr?.metallicRoughnessTexture)
      throw Error("Teksturer understøttes ikke");
    if (
      pbr?.baseColorFactor !== undefined &&
      !finiteVector(pbr.baseColorFactor, 4, 1)
    )
      throw Error("Ugyldig GLB-farve");
    if (
      material.emissiveFactor !== undefined &&
      !finiteVector(material.emissiveFactor, 3, 1)
    )
      throw Error("Ugyldig GLB-emission");
    for (const key of ["roughnessFactor", "metallicFactor"])
      if (
        pbr?.[key] !== undefined &&
        (typeof pbr[key] !== "number" ||
          !Number.isFinite(pbr[key]) ||
          pbr[key] < 0 ||
          pbr[key] > 1)
      )
        throw Error("Ugyldigt GLB-materiale");
  }
  const nodes = data.nodes ?? [];
  if (
    !nodes.length ||
    nodes.length > 256 ||
    !data.scenes?.length ||
    data.scenes.length > 20
  )
    throw Error("GLB kræver en scene med højst 256 noder");
  const visiting = new Set<number>(),
    visited = new Set<number>(),
    parents = new Map<number, number>();
  const visit = (index: number, depth: number) => {
    if (!integer(index) || !nodes[index] || depth > 64)
      throw Error("Ugyldigt eller for dybt GLB-hierarki");
    if (visiting.has(index)) throw Error("GLB-hierarkiet indeholder en cyklus");
    if (visited.has(index)) return;
    visiting.add(index);
    const node = nodes[index];
    if (node.skin !== undefined || node.weights !== undefined)
      throw Error("Rigs og morph targets understøttes ikke");
    if (node.mesh !== undefined && (!integer(node.mesh) || !meshes[node.mesh]))
      throw Error("GLB-node henviser til en manglende mesh");
    for (const [key, size] of [
      ["matrix", 16],
      ["translation", 3],
      ["rotation", 4],
      ["scale", 3],
    ] as const)
      if (node[key] !== undefined && !finiteVector(node[key], size))
        throw Error("Ugyldig GLB-transform");
    if (
      node.children !== undefined &&
      (!Array.isArray(node.children) || node.children.length > 256)
    )
      throw Error("Ugyldige GLB-børn");
    for (const child of node.children ?? []) {
      if (visiting.has(child))
        throw Error("GLB-hierarkiet indeholder en cyklus");
      if (parents.has(child)) throw Error("GLB-noder må kun have én forælder");
      parents.set(child, index);
      visit(child, depth + 1);
    }
    visiting.delete(index);
    visited.add(index);
  };
  for (let i = 0; i < nodes.length; i++) visit(i, 0);
  for (const scene of data.scenes) {
    if (
      !Array.isArray(scene.nodes) ||
      !scene.nodes.length ||
      new Set(scene.nodes).size !== scene.nodes.length
    )
      throw Error("Ugyldig GLB-scene");
    for (const node of scene.nodes)
      if (!integer(node) || !nodes[node] || parents.has(node))
        throw Error("Ugyldig GLB-scene");
  }
  if (!integer(data.scene ?? 0) || !data.scenes[data.scene ?? 0])
    throw Error("GLB-standardscenen mangler");
  const sum = (index: number, depth = 0): number => {
    if (depth > 64) throw Error("For dybt GLB-hierarki");
    return (
      (meshTriangles[nodes[index].mesh] ?? 0) +
      (nodes[index].children ?? []).reduce(
        (n: number, child: number) => n + sum(child, depth + 1),
        0,
      )
    );
  };
  for (const scene of data.scenes) for (const root of scene.nodes) sum(root);
  if (
    nodes.reduce(
      (n: number, node: any) => n + (meshTriangles[node.mesh] ?? 0),
      0,
    ) > 100000
  )
    throw Error("Modellen må højst have 100.000 trekanter inklusive instanser");
  const triangles = data.scenes[data.scene ?? 0].nodes.reduce(
    (n: number, index: number) => n + sum(index),
    0,
  );
  if (!triangles) throw Error("GLB indeholder ingen trekantsgeometri");
  if (triangles > 100000)
    throw Error("Modellen må højst have 100.000 trekanter inklusive instanser");
  return {
    triangles,
    textureCount: 0,
    meshCount: meshes.length,
    nodeCount: nodes.length,
    warnings:
      triangles > 50000
        ? ["Tung model: brug 2D-plan på en langsom enhed."]
        : [],
  };
}
