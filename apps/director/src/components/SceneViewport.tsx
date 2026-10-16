"use client";
import { useEffect, useRef, useState } from "react";
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
}: {
  scene: SceneVersion;
  camera: Camera;
  selectedId: string | null;
  grid: boolean;
  mode: "3d" | "2d";
  onMode: (v: "3d" | "2d") => void;
  onCamera: (p: Vector, t: Vector) => void;
  onSelect: (id: string) => void;
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
      void loadSceneModels(world, scene, selectedId ?? undefined)
        .then(() => {
          if (disposed) {
            disposeScene(world);
            return;
          }
          draw();
        })
        .catch(() => {
          if (!disposed) {
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
      <div className="plan-view">
        <svg
          viewBox="0 0 800 450"
          role="img"
          aria-label="2D-plan af observationsdækket med objekter og kamera"
        >
          <defs>
            <pattern
              id="plan-grid"
              width="35"
              height="35"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 35 0 L 0 0 0 35"
                fill="none"
                stroke="#34404a"
                strokeWidth=".7"
              />
            </pattern>
          </defs>
          <rect width="800" height="450" fill="#1c252d" />
          <rect
            x="166"
            y="80"
            width="468"
            height="260"
            rx="6"
            fill="url(#plan-grid)"
            stroke="#64706e"
            strokeWidth="2"
          />
          <path d="M 210 80 H 590" stroke="#c5a476" strokeWidth="5" />
          <text
            x="400"
            y="63"
            fill="#aeb8b9"
            textAnchor="middle"
            fontSize="11"
            letterSpacing="3"
          >
            OBSERVATIONSVINDUE
          </text>
          {scene.objects.map((object) => {
            const x = 400 + object.transform.position[0] * 26;
            const y = 220 + object.transform.position[2] * 20;
            return (
              <g
                key={object.id}
                role="button"
                tabIndex={0}
                aria-label={`Vælg ${object.name}`}
                onClick={() => onSelect(object.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(object.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={object.kind === "person" ? 13 : 19}
                  fill={object.color}
                  stroke={selectedId === object.id ? "#fff" : "#172026"}
                  strokeWidth="3"
                />
                <text
                  x={x}
                  y={y + 34}
                  textAnchor="middle"
                  fill="#e4e7df"
                  fontSize="12"
                >
                  {object.name}
                </text>
              </g>
            );
          })}
          <path
            d={`M ${400 + camera.position[0] * 26} ${220 + camera.position[2] * 20} L ${400 + camera.target[0] * 26} ${220 + camera.target[2] * 20}`}
            stroke="#e5a476"
            strokeWidth="2"
            strokeDasharray="6 5"
          />
          <circle
            cx={400 + camera.position[0] * 26}
            cy={220 + camera.position[2] * 20}
            r="10"
            fill="#e5a476"
          />
          <text x="100" y="425" fill="#9fa9aa" fontSize="11">
            Y op · meter · redigér position i objektpanelet
          </text>
        </svg>
        {failed && (
          <span className="fallback-note">
            WebGL er ikke tilgængelig. Du kan fortsætte i 2D.
          </span>
        )}
      </div>
    );
  return (
    <canvas
      ref={ref}
      className="scene-canvas"
      aria-label="3D-scene. Træk for at dreje kameraet. Højreklik og træk for at panorere. Dobbeltklik et objekt for at vælge det."
    />
  );
}
