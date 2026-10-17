"use client";
import { useEffect, useRef, useState } from "react";
import { PlanEditor } from "./PlanEditor";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Camera, SceneVersion, Vector } from "@tre/scene-format";
import {
  buildScene,
  loadSceneModels,
  createRenderer,
  disposeScene,
  makeCamera,
} from "../lib/scene-renderer";

export function SceneViewport({
  scene,
  camera,
  selectedId,
  grid,
  mode,
  onMode,
  onCamera,
  onSelect,
  onObject,
  onSelectCamera,
}: {
  scene: SceneVersion;
  camera: Camera;
  selectedId: string | null;
  grid: boolean;
  mode: "3d" | "2d";
  onMode: (v: "3d" | "2d") => void;
  onCamera: (p: Vector, t: Vector) => void;
  onSelect: (id: string) => void;
  onObject: (id: string, position: Vector) => void;
  onSelectCamera: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onCamera, onSelect, onMode });
  callbacks.current = { onCamera, onSelect, onMode };
  const [failed, setFailed] = useState(false);
  const sceneKey = JSON.stringify({
      ...scene,
      assets: scene.assets.map(({ dataUrl, ...metadata }) => metadata),
    }),
    cameraKey = JSON.stringify(camera);
  useEffect(() => {
    if (mode === "2d" || !ref.current) return;
    let cleanup = () => {};
    try {
      const renderer = createRenderer(ref.current);
      const world = buildScene(scene, selectedId ?? undefined, grid);
      const cam = makeCamera(camera);
      const controls = new OrbitControls(cam, renderer.domElement);
      controls.target.fromArray(camera.target);
      controls.enableDamping = false;
      controls.minDistance = 0.5;
      controls.maxDistance = 40;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.update();
      const draw = () => renderer.render(world, cam);
      const resize = () => {
        const box = renderer.domElement.getBoundingClientRect();
        renderer.setSize(
          Math.max(1, Math.round(box.width * Math.min(devicePixelRatio, 1.5))),
          Math.max(1, Math.round(box.height * Math.min(devicePixelRatio, 1.5))),
          false,
        );
        draw();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(renderer.domElement);
      resize();
      let disposed = false;
      const modelLoad = new AbortController();
      void loadSceneModels(
        world,
        scene,
        selectedId ?? undefined,
        modelLoad.signal,
      )
        .then(() => {
          if (disposed) {
            disposeScene(world);
            return;
          }
          draw();
        })
        .catch(() => {
          if (disposed) disposeScene(world);
          else {
            setFailed(true);
            callbacks.current.onMode("2d");
          }
        });
      controls.addEventListener("change", draw);
      controls.addEventListener("end", () => {
        const position = cam.position.toArray() as Vector,
          target = controls.target.toArray() as Vector;
        if (
          position.some((v, i) => Math.abs(v - camera.position[i]) > 0.001) ||
          target.some((v, i) => Math.abs(v - camera.target[i]) > 0.001)
        )
          callbacks.current.onCamera(position, target);
      });
      const select = (event: MouseEvent) => {
        if (event.button !== 0) return;
        const bounds = renderer.domElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(
          new THREE.Vector2(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
          ),
          cam,
        );
        for (const hit of ray.intersectObjects(world.children, true)) {
          let object: THREE.Object3D | null = hit.object;
          while (object && !object.userData.objectId) object = object.parent;
          if (object?.userData.objectId) {
            callbacks.current.onSelect(object.userData.objectId);
            break;
          }
        }
      };
      renderer.domElement.addEventListener("dblclick", select);
      const contextLost = (event: Event) => {
        event.preventDefault();
        setFailed(true);
        callbacks.current.onMode("2d");
      };
      renderer.domElement.addEventListener("webglcontextlost", contextLost);
      cleanup = () => {
        disposed = true;
        modelLoad.abort();
        observer.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener("dblclick", select);
        renderer.domElement.removeEventListener(
          "webglcontextlost",
          contextLost,
        );
        disposeScene(world);
        renderer.dispose();
        if (!renderer.domElement.isConnected) renderer.forceContextLoss();
      };
    } catch {
      setFailed(true);
      callbacks.current.onMode("2d");
    }
    return cleanup;
  }, [sceneKey, cameraKey, selectedId, grid, mode]);
  if (mode === "2d")
    return (
      <PlanEditor
        scene={scene}
        camera={camera}
        selectedId={selectedId}
        grid={grid}
        failed={failed}
        onSelect={onSelect}
        onObject={onObject}
        onCamera={onCamera}
        onSelectCamera={onSelectCamera}
      />
    );
  return (
    <canvas
      ref={ref}
      className="scene-canvas"
      aria-label="3D-scene. Træk for at dreje kameraet. Højreklik og træk for at panorere. Dobbeltklik et objekt for at vælge det."
    />
  );
}
