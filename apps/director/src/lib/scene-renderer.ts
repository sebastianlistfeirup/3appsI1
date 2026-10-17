import { parseEmbeddedGlb, disposeModelResources } from "./glb-resources";
import { checkMediaAbort } from "./media-lifecycle";
import * as THREE from "three";
import {
  RENDERER_VERSION,
  type Camera,
  type SceneObject,
  type SceneVersion,
  type Vector,
} from "@tre/scene-format";
import {
  fitPlan,
  planPoint,
  planFloor,
  PLAN_RENDERER_VERSION,
} from "./plan-geometry";

const mat = (color: string, metalness = 0.1, roughness = 0.65) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
}
function emissive(color: string, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
  });
}
export function primitive(object: SceneObject) {
  const group = new THREE.Group();
  group.name = object.id;
  group.userData.objectId = object.id;
  const body = mat(object.color, 0.18, 0.65),
    dark = mat("#17292e", 0.45, 0.4),
    trim = mat("#cbb99d", 0.5, 0.4);
  if (object.kind === "person") {
    const torso = mesh(
      new THREE.CylinderGeometry(0.27, 0.22, 0.62, 6),
      body,
      0,
      1.04,
      0,
    );
    group.add(torso);
    group.add(mesh(new THREE.SphereGeometry(0.205, 12, 8), trim, 0, 1.61, 0));
    const visor = mesh(
      new THREE.SphereGeometry(0.209, 12, 8, 0, Math.PI),
      dark,
      0,
      1.63,
      0.01,
    );
    visor.scale.set(1, 0.55, 1);
    group.add(visor);
    group.add(box(0.38, 0.12, 0.3, dark, 0, 0.68, 0));
    for (const sign of [-1, 1]) {
      group.add(
        mesh(
          new THREE.CylinderGeometry(0.09, 0.105, 0.55, 6),
          body,
          sign * 0.15,
          0.36,
          0,
        ),
      );
      group.add(box(0.18, 0.13, 0.3, dark, sign * 0.15, 0.075, 0.04));
      const arm = mesh(
        new THREE.CylinderGeometry(0.075, 0.08, 0.55, 6),
        body,
        sign * 0.34,
        1.02,
        0.015,
      );
      arm.rotation.z = sign * 0.09;
      group.add(arm);
      group.add(
        mesh(
          new THREE.SphereGeometry(0.085, 8, 6),
          dark,
          sign * 0.365,
          0.72,
          0.015,
        ),
      );
    }
    group.add(box(0.22, 0.18, 0.025, trim, 0, 1.15, 0.24));
    group.add(box(0.1, 0.04, 0.03, emissive("#b7e3c8"), 0.065, 1.18, 0.26));
    group.add(box(0.33, 0.45, 0.17, dark, 0, 1.05, -0.25));
  } else if (object.kind === "console") {
    group.add(
      box(1.7, 0.15, 0.9, dark, 0, 0.1, 0),
      box(1.35, 0.8, 0.65, body, 0, 0.5, 0),
    );
    const top = box(1.7, 0.12, 0.95, trim, 0, 0.98, 0);
    top.rotation.x = 0.18;
    group.add(top);
    const screen = box(
      1.1,
      0.035,
      0.53,
      emissive("#74c1ae", 0.8),
      0,
      1.055,
      -0.06,
    );
    screen.rotation.x = 0.18;
    group.add(screen);
    for (let i = 0; i < 6; i++)
      group.add(
        box(
          0.08,
          0.035,
          0.08,
          emissive(i === 0 ? "#e7a36e" : "#a8b8ad", 0.4),
          -0.45 + i * 0.18,
          1.04,
          0.31,
        ),
      );
    const glow = new THREE.PointLight("#89dabd", 2, 3, 2);
    glow.position.set(0, 1.4, 0);
    group.add(glow);
  } else if (object.kind === "crate") {
    group.add(box(1, 0.8, 0.9, body, 0, 0.4, 0));
    for (const x of [-0.4, 0.4])
      group.add(box(0.09, 0.86, 0.97, dark, x, 0.4, 0));
    group.add(box(0.3, 0.13, 0.02, trim, 0, 0.45, 0.46));
  } else if (object.kind === "wall")
    group.add(box(2.4, 2.8, 0.25, body, 0, 1.4, 0));
  else {
    group.add(
      mesh(new THREE.CylinderGeometry(0.19, 0.28, 0.13, 12), dark, 0, 0.065, 0),
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 8), trim, 0, 0.95, 0),
      mesh(
        new THREE.SphereGeometry(0.17, 12, 8),
        emissive(object.color, 3),
        0,
        1.9,
        0,
      ),
    );
    const lamp = new THREE.PointLight(object.color, 3, 7, 2);
    lamp.position.set(0, 1.9, 0);
    group.add(lamp);
  }
  group.position.fromArray(object.transform.position);
  group.quaternion.fromArray(object.transform.quaternion);
  group.scale.fromArray(object.transform.scale);
  return group;
}
/** Entirely procedural locations; their exact palette is part of the immutable scene. */
function buildStudio(scene: THREE.Scene, version: SceneVersion) {
  const surface = mat(version.environment.groundColor, 0.02, 0.87);
  surface.side = THREE.DoubleSide;
  const points: [number, number][] = [[0, 20]];
  for (let index = 0; index <= 24; index++) {
    const angle = ((index / 24) * Math.PI) / 2;
    points.push([3 * (1 - Math.cos(angle)), -6 - 3 * Math.sin(angle)]);
  }
  points.push([10, -9]);
  const positions: number[] = [],
    indices: number[] = [];
  for (const [y, z] of points) positions.push(-30, y, z, 30, y, z);
  for (let index = 0; index < points.length - 1; index++) {
    const at = index * 2;
    indices.push(at, at + 2, at + 1, at + 1, at + 2, at + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const backdrop = mesh(geometry, surface);
  backdrop.castShadow = false;
  scene.add(backdrop);
}
function buildCourtyard(scene: THREE.Scene, version: SceneVersion) {
  const paving = mat(version.environment.groundColor, 0, 0.92),
    stone = mat("#b9aa92", 0, 0.9),
    cap = mat("#d4c4a4", 0, 0.86),
    dark = mat("#756856", 0, 0.9);
  scene.add(box(22, 0.15, 22, paving, 0, -0.1, 0));
  for (let index = -10; index <= 10; index += 2) {
    scene.add(box(0.014, 0.01, 20, dark, index, -0.019, 0));
    scene.add(box(20, 0.01, 0.014, dark, 0, -0.019, index));
  }
  scene.add(box(6, 3.4, 0.55, stone, -5.1, 1.7, -6));
  scene.add(box(6, 3.4, 0.55, stone, 5.1, 1.7, -6));
  scene.add(box(6.1, 0.2, 0.75, cap, -5.1, 3.45, -6));
  scene.add(box(6.1, 0.2, 0.75, cap, 5.1, 3.45, -6));
  scene.add(
    mesh(new THREE.TorusGeometry(2.1, 0.34, 8, 32, Math.PI), cap, 0, 2.4, -6),
  );
  for (const x of [-2.1, 2.1]) {
    scene.add(box(0.65, 2.4, 0.7, cap, x, 1.2, -6));
    scene.add(box(0.9, 0.2, 0.9, dark, x, 0.1, -6));
  }
  for (const x of [-5, 5]) {
    scene.add(
      mesh(
        new THREE.CylinderGeometry(0.55, 0.4, 0.8, 10),
        mat("#91725c", 0, 0.95),
        x,
        0.4,
        -2.5,
      ),
    );
    scene.add(
      mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.7, 7), dark, x, 1.4, -2.5),
    );
    const crown = mesh(
      new THREE.IcosahedronGeometry(1.25, 1),
      mat("#586d4c", 0, 1),
      x,
      2.7,
      -2.5,
    );
    crown.scale.set(0.9, 1, 0.85);
    scene.add(crown);
  }
  const landscape = mesh(
    new THREE.PlaneGeometry(250, 250),
    mat("#87917a", 0, 1),
    0,
    -0.3,
    -45,
  );
  landscape.rotation.x = -Math.PI / 2;
  scene.add(landscape);
  for (let index = 0; index < 8; index++) {
    const hill = mesh(
      new THREE.SphereGeometry(8 + (index % 3), 12, 8),
      mat(index % 2 ? "#7d8f7a" : "#657d71", 0, 1),
      -40 + index * 12,
      -3,
      -35 - (index % 3) * 5,
    );
    hill.scale.set(1.3, 0.7, 1);
    hill.castShadow = false;
    scene.add(hill);
  }
}
export function buildScene(
  version: SceneVersion,
  selectedId?: string,
  grid = false,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(version.environment.skyColor);
  scene.fog = new THREE.FogExp2(
    version.environment.preset === "station"
      ? "#27323c"
      : version.environment.skyColor,
    version.environment.preset === "station" ? 0.006 : 0.012,
  );
  const ambient = new THREE.HemisphereLight("#a5bac4", "#302d27", 1.8);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight(
    version.light.warmth === "amber" ? "#ffd0a0" : "#b6dbff",
    4.2 * version.light.intensity,
  );
  sunlight.position.set(-7, 8, -12);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -13;
  sunlight.shadow.camera.right = 13;
  sunlight.shadow.camera.top = 12;
  sunlight.shadow.camera.bottom = -12;
  sunlight.shadow.normalBias = 0.03;
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight("#adcbdc", 2.2);
  fill.position.set(5, 5, 8);
  scene.add(fill);
  if (version.environment.preset === "station") {
    // A fully procedural station. No stock images, remote textures or hidden assets.
    const floor = mat(version.environment.groundColor, 0.55, 0.45),
      structure = mat("#34434b", 0.2, 0.65),
      edge = mat("#6f7975", 0.65, 0.4);
    scene.add(box(15, 0.3, 15, floor, 0, -0.2, 0));
    for (let i = -6; i <= 6; i += 2) {
      scene.add(
        box(0.018, 0.008, 14, structure, i, -0.041, 0),
        box(14, 0.008, 0.018, structure, 0, -0.041, i),
      );
    }
    scene.add(
      box(15, 0.7, 0.5, structure, 0, 0.2, -5),
      box(15, 0.12, 0.7, edge, 0, 0.61, -5),
    );
    scene.add(
      box(0.5, 7, 11, structure, -6, 3, -0.3),
      box(0.5, 7, 11, structure, 6, 3, -0.3),
      box(12, 0.5, 1, structure, 0, 5.8, -4.8),
    );
    for (const x of [-5.5, -3.6, 3.6, 5.5]) {
      const pillar = box(0.19, 6, 0.25, edge, x, 2.7, -4.8);
      pillar.rotation.z = x > 0 ? -0.13 : 0.13;
      scene.add(pillar);
    }
    for (const x of [-5.1, 5.1])
      scene.add(box(0.04, 4.3, 0.04, emissive("#d9b07c", 1.2), x, 2.7, -4.65));
    for (const x of [-4.5, 4.5])
      scene.add(box(0.035, 0.01, 11, emissive("#ab8a5e", 0.5), x, -0.025, 0.5));
    const horizon = mesh(
      new THREE.PlaneGeometry(300, 300),
      mat("#636c6c", 0.05, 1),
      0,
      -0.6,
      -60,
    );
    horizon.rotation.x = -Math.PI / 2;
    horizon.receiveShadow = false;
    scene.add(horizon);
    for (let i = 0; i < 23; i++) {
      const h = 2 + ((i * 17) % 13) * 0.6;
      const mountain = mesh(
        new THREE.ConeGeometry(4 + ((i * 7) % 5), h, 4),
        mat(i % 2 ? "#646c70" : "#737872", 0.05, 1),
        -65 + i * 6,
        -0.5 + h / 2,
        -38 - (i % 4) * 6,
      );
      mountain.rotation.y = i * 0.7;
      scene.add(mountain);
    }
    const sun = mesh(
      new THREE.SphereGeometry(5.7, 48, 32),
      new THREE.MeshBasicMaterial({ color: "#f3d0a0", toneMapped: false }),
      -17,
      12,
      -66,
    );
    sun.castShadow = false;
    scene.add(sun);
    const planet = mesh(
      new THREE.SphereGeometry(11, 32, 24),
      mat("#617478", 0.05, 1),
      27,
      28,
      -110,
    );
    planet.castShadow = false;
    scene.add(planet);
    const stars = new THREE.BufferGeometry();
    const coords = [];
    for (let i = 0; i < 170; i++) {
      const x = Math.sin(i * 72.31) * 130;
      const y = 10 + ((i * 19) % 100);
      coords.push(x, y, -140 - ((i * 13) % 25));
    }
    stars.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
    scene.add(
      new THREE.Points(
        stars,
        new THREE.PointsMaterial({
          color: "#e5ded1",
          size: 0.16,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
  } else if (version.environment.preset === "studio") {
    buildStudio(scene, version);
  } else {
    buildCourtyard(scene, version);
  }
  for (const object of version.objects) {
    if (object.kind === "glb") continue;
    const group = primitive(object);
    scene.add(group);
    if (object.id === selectedId) {
      const bounds = new THREE.Box3().setFromObject(group);
      const helper = new THREE.Box3Helper(bounds, new THREE.Color("#e0a174"));
      scene.add(helper);
    }
  }
  if (grid) {
    const helper = new THREE.GridHelper(14, 28, "#c36536", "#657574");
    helper.position.y = 0.002;
    scene.add(helper);
  }
  return scene;
}
export function makeCamera(value: Camera) {
  const c = new THREE.PerspectiveCamera(
    value.verticalFov,
    16 / 9,
    value.near,
    value.far,
  );
  c.position.fromArray(value.position);
  c.quaternion.fromArray(value.quaternion);
  c.updateMatrixWorld();
  return c;
}
export function createRenderer(canvas?: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}
export function disposeScene(scene: THREE.Scene) {
  disposeModelResources([scene, ...(scene.userData.glbRoots ?? [])]);
}
/** A real 720p floor-plan frame keeps the editor usable without WebGL. */
export function renderPlanFrame(version: SceneVersion, camera: Camera) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Browseren kan ikke tegne et 2D-frame");
  ctx.scale(1.6, 1.6);
  ctx.fillStyle = "#18232c";
  ctx.fillRect(0, 0, 800, 450);
  const size = { width: 800, height: 450 },
    view = fitPlan(version, camera, size);
  const point = (position: Vector) => planPoint(position, view, size);
  const x = (value: number) => point([value, 0, 0])[0],
    y = (value: number) => point([0, 0, value])[1];
  const step = view.scale * (view.scale < 4 ? 10 : view.scale < 12 ? 5 : 1);
  ctx.strokeStyle = "#35434e";
  ctx.lineWidth = 0.7;
  for (let px = ((x(0) % step) + step) % step; px < 800; px += step) {
    ctx.beginPath();
    ctx.moveTo(px, 38);
    ctx.lineTo(px, 412);
    ctx.stroke();
  }
  for (let py = ((y(0) % step) + step) % step; py < 420; py += step) {
    ctx.beginPath();
    ctx.moveTo(30, py);
    ctx.lineTo(770, py);
    ctx.stroke();
  }
  ctx.strokeStyle = "#738380";
  ctx.lineWidth = 2;
  const floor = planFloor(version);
  ctx.strokeRect(
    x(floor[0]),
    y(floor[1]),
    floor[2] * view.scale,
    floor[3] * view.scale,
  );
  ctx.textAlign = "center";
  for (const object of version.objects) {
    const p = object.transform.position;
    ctx.beginPath();
    ctx.arc(
      x(p[0]),
      y(p[2]),
      object.kind === "person" ? 10 : 15,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = object.color;
    ctx.fill();
    ctx.strokeStyle = "#e2e4d7";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f0eee4";
    ctx.font = "12px sans-serif";
    ctx.fillText(object.name.slice(0, 30), x(p[0]), y(p[2]) + 30);
  }
  ctx.strokeStyle = "#e9ad79";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x(camera.position[0]), y(camera.position[2]));
  ctx.lineTo(x(camera.target[0]), y(camera.target[2]));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#e9ad79";
  ctx.beginPath();
  ctx.arc(x(camera.position[0]), y(camera.position[2]), 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = "#ede1cf";
  ctx.font = "600 14px sans-serif";
  ctx.fillText("2D-PLAN · " + camera.name, 28, 28);
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#b1c0c9";
  ctx.fillText(
    version.name + " · scene v" + version.version + " · topvisning i meter",
    28,
    436,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}
export async function renderFrame(
  version: SceneVersion,
  camera: Camera,
  mode: "3d" | "2d" = "3d",
  signal?: AbortSignal,
): Promise<{ frame: string; mode: "3d" | "plan"; rendererVersion: string }> {
  checkMediaAbort(signal);
  if (mode === "2d")
    return {
      frame: renderPlanFrame(version, camera),
      mode: "plan",
      rendererVersion: PLAN_RENDERER_VERSION,
    };
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer();
  } catch {
    return {
      frame: renderPlanFrame(version, camera),
      mode: "plan",
      rendererVersion: PLAN_RENDERER_VERSION,
    };
  }
  let scene: THREE.Scene | undefined;
  try {
    renderer.setSize(1280, 720);
    scene = buildScene(version);
    await loadSceneModels(scene, version, undefined, signal);
    checkMediaAbort(signal);
    renderer.render(scene, makeCamera(camera));
    return {
      frame: renderer.domElement.toDataURL("image/jpeg", 0.88),
      mode: "3d",
      rendererVersion: RENDERER_VERSION,
    };
  } finally {
    if (scene) disposeScene(scene);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Validated, embedded-only static GLB assets. Loading never fetches a network URL. */
export async function loadSceneModels(
  scene: THREE.Scene,
  version: SceneVersion,
  selectedId?: string,
  signal?: AbortSignal,
) {
  if (!version.objects.some((o) => o.kind === "glb")) return;
  const loaded = new Map<string, THREE.Group>();
  scene.userData.glbRoots ??= [];
  for (const object of version.objects.filter((o) => o.kind === "glb")) {
    checkMediaAbort(signal);
    const asset = version.assets.find((a) => a.id === object.assetId);
    if (!asset) throw Error("GLB-modelversion mangler");
    let source = loaded.get(asset.sha256);
    if (!source) {
      const raw = atob(asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1));
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const gltf = await parseEmbeddedGlb(bytes.buffer, signal);
      source = gltf.scene;
      loaded.set(asset.sha256, source);
      scene.userData.glbRoots.push(...gltf.scenes);
    }
    const instance = source.clone(true);
    const copiedMaterials = new Map<THREE.Material, THREE.Material>();
    instance.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const copy = (material: THREE.Material) => {
          let next = copiedMaterials.get(material);
          if (!next) {
            next = material.clone();
            copiedMaterials.set(material, next);
          }
          return next;
        };
        child.material = Array.isArray(child.material)
          ? child.material.map(copy)
          : copy(child.material);
      }
    });
    const group = new THREE.Group();
    group.name = object.id;
    group.userData.objectId = object.id;
    group.add(instance);
    group.position.fromArray(object.transform.position);
    group.quaternion.fromArray(object.transform.quaternion);
    group.scale.fromArray(object.transform.scale);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        for (const material of Array.isArray(child.material)
          ? child.material
          : [child.material]) {
          if (material instanceof THREE.MeshStandardMaterial)
            material.color.multiply(new THREE.Color(object.color));
        }
      }
    });
    scene.add(group);
    if (selectedId === object.id)
      scene.add(
        new THREE.Box3Helper(
          new THREE.Box3().setFromObject(group),
          new THREE.Color("#e0a174"),
        ),
      );
  }
}
