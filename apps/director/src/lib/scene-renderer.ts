import * as THREE from "three";
import type { Camera, SceneObject, SceneVersion } from "@tre/scene-format";

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
export function buildScene(
  version: SceneVersion,
  selectedId?: string,
  grid = false,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#18212c");
  scene.fog = new THREE.FogExp2("#27323c", 0.006);
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
  // A fully procedural station. No stock images, remote textures or hidden assets.
  const floor = mat("#3e484b", 0.55, 0.45),
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
  for (const object of version.objects) {
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
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      o.geometry.dispose();
      for (const material of Array.isArray(o.material)
        ? o.material
        : [o.material])
        material.dispose();
    }
  });
}
export async function renderFrame(
  version: SceneVersion,
  camera: Camera,
  width = 1280,
  height = 720,
) {
  const renderer = createRenderer();
  renderer.setSize(width, height);
  const scene = buildScene(version);
  try {
    renderer.render(scene, makeCamera(camera));
    return renderer.domElement.toDataURL("image/jpeg", 0.88);
  } finally {
    disposeScene(scene);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
