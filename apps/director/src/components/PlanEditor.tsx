"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Camera, SceneVersion, Vector } from "@tre/scene-format";
import {
  fitPlan,
  moveInPlan,
  planPoint,
  planFloor,
  samePlanPosition,
  type PlanSize,
  type PlanView,
} from "../lib/plan-geometry";

type Handle = "object" | "camera" | "target" | "pan";
type Gesture = {
  handle: Handle;
  id?: string;
  origin: Vector;
  candidate: Vector;
  start: [number, number];
  view: PlanView;
  key: string;
  owner: Element;
  pointerId?: number;
  keyboard: boolean;
};
const release = (gesture: Gesture | null) => {
  if (
    gesture?.pointerId !== undefined &&
    gesture.owner.hasPointerCapture(gesture.pointerId)
  )
    gesture.owner.releasePointerCapture(gesture.pointerId);
};
export function PlanEditor({
  scene,
  camera,
  selectedId,
  grid,
  failed,
  onSelect,
  onObject,
  onCamera,
  onSelectCamera,
}: {
  scene: SceneVersion;
  camera: Camera;
  selectedId: string | null;
  grid: boolean;
  failed: boolean;
  onSelect: (id: string) => void;
  onObject: (id: string, position: Vector) => void;
  onCamera: (position: Vector, target: Vector) => void;
  onSelectCamera: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null),
    active = useRef<Gesture | null>(null);
  const [size, setSize] = useState<PlanSize>({ width: 800, height: 360 });
  const [view, setView] = useState<PlanView | null>(null);
  const [draft, setDraft] = useState<Gesture | null>(null);
  const [tool, setTool] = useState<"object" | "camera">("object");
  const [snap, setSnap] = useState(true),
    [notice, setNotice] = useState("");
  const gridId = useId();
  const currentView = view ?? fitPlan(scene, camera, size);
  const key = JSON.stringify([
    scene.id,
    scene.objects.map((o) => [o.id, o.transform]),
    camera.id,
    camera.position,
    camera.target,
  ]);
  const latest = useRef({ key, camera, onObject, onCamera });
  latest.current = { key, camera, onObject, onCamera };
  const cancel = (restoreView = true) => {
    const gesture = active.current;
    active.current = null;
    release(gesture);
    if (gesture?.handle === "pan" && restoreView) setView(gesture.view);
    setDraft(null);
    if (gesture) setNotice("Flytning annulleret. Scenen er uændret.");
  };
  const finish = () => {
    const gesture = active.current;
    active.current = null;
    release(gesture);
    setDraft(null);
    if (
      !gesture ||
      gesture.handle === "pan" ||
      samePlanPosition(gesture.origin, gesture.candidate)
    )
      return;
    if (gesture.key !== latest.current.key) {
      setNotice("Scenen ændrede sig. Flytningen er annulleret.");
      return;
    }
    if (gesture.handle === "object" && gesture.id)
      latest.current.onObject(gesture.id, gesture.candidate);
    else {
      const position =
        gesture.handle === "camera"
          ? gesture.candidate
          : latest.current.camera.position;
      const target =
        gesture.handle === "target"
          ? gesture.candidate
          : latest.current.camera.target;
      if (samePlanPosition(position, target)) {
        setNotice("Kamera og sigtepunkt skal være forskellige.");
        return;
      }
      latest.current.onCamera(position, target);
    }
    setNotice("Placering gemt. Fortryd gendanner hele flytningen.");
  };
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      const gesture = active.current;
      if (gesture && !gesture.keyboard) {
        active.current = null;
        release(gesture);
        setDraft(null);
        setNotice("Visningen ændrede størrelse. Flytningen er annulleret.");
      }
      setSize({
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
      });
      setView(null);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      const gesture = active.current;
      active.current = null;
      release(gesture);
    };
  }, []);
  useEffect(() => {
    if (active.current && active.current.key !== key) cancel();
  }, [key]);
  const point = (event: ReactPointerEvent): [number, number] => {
    const box = svg.current!.getBoundingClientRect();
    return [
      ((event.clientX - box.left) * size.width) / box.width,
      ((event.clientY - box.top) * size.height) / box.height,
    ];
  };
  const originFor = (handle: Handle, id?: string): Vector =>
    handle === "object"
      ? scene.objects.find((o) => o.id === id)!.transform.position
      : handle === "camera"
        ? camera.position
        : handle === "target"
          ? camera.target
          : [0, 0, 0];
  const select = (handle: Handle, id?: string) => {
    if (handle === "object" && id) onSelect(id);
    else if (handle !== "pan") onSelectCamera();
  };
  const begin = (
    event: ReactPointerEvent<SVGElement>,
    handle: Handle,
    id?: string,
  ) => {
    if (event.button !== 0 || active.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (handle === "object") {
      // In a dense set, transparent hit areas overlap. Pick the nearest centre,
      // so the topmost SVG node cannot steal another object's visible handle.
      const pointer = point(event);
      id = [...scene.objects].sort((a, b) => {
        const pa = planPoint(a.transform.position, currentView, size),
          pb = planPoint(b.transform.position, currentView, size);
        return (
          Math.hypot(pa[0] - pointer[0], pa[1] - pointer[1]) -
          Math.hypot(pb[0] - pointer[0], pb[1] - pointer[1])
        );
      })[0]?.id;
    }
    const owner = svg.current!;
    const focusTarget =
      handle === "object"
        ? owner.querySelector<SVGElement>(
            `[data-plan-object="${CSS.escape(id!)}"]`,
          )
        : event.currentTarget;
    focusTarget?.focus({ preventScroll: true });
    select(handle, id);
    const origin = originFor(handle, id);
    const gesture: Gesture = {
      handle,
      id,
      origin,
      candidate: origin,
      start: point(event),
      view: currentView,
      key,
      owner,
      pointerId: event.pointerId,
      keyboard: false,
    };
    active.current = gesture;
    setView(currentView);
    owner.setPointerCapture(event.pointerId);
    setDraft({ ...gesture });
    setNotice("");
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const position = point(event),
      dx = position[0] - gesture.start[0],
      dz = position[1] - gesture.start[1];
    if (Math.hypot(dx, dz) < 3) {
      if (gesture.handle === "pan") setView(gesture.view);
      else {
        gesture.candidate = gesture.origin;
        setDraft({ ...gesture });
      }
      return;
    }
    if (gesture.handle === "pan")
      setView({
        ...gesture.view,
        x: gesture.view.x - dx / gesture.view.scale,
        z: gesture.view.z - dz / gesture.view.scale,
      });
    else {
      gesture.candidate = moveInPlan(
        gesture.origin,
        dx / gesture.view.scale,
        dz / gesture.view.scale,
        snap,
      );
      setDraft({ ...gesture });
    }
  };
  const keys = (
    event: KeyboardEvent<SVGElement>,
    handle: Handle,
    id?: string,
  ) => {
    if (
      event.key === "Escape" ||
      ((event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        active.current)
    ) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      select(handle, id);
      return;
    }
    if (!event.key.startsWith("Arrow") || handle === "pan") return;
    event.preventDefault();
    event.stopPropagation();
    if (active.current && !active.current.keyboard) return;
    select(handle, id);
    let gesture = active.current;
    if (!gesture) {
      const origin = originFor(handle, id);
      gesture = {
        handle,
        id,
        origin,
        candidate: origin,
        start: [0, 0],
        view: currentView,
        key,
        owner: event.currentTarget,
        keyboard: true,
      };
      active.current = gesture;
      setView(currentView);
    }
    const delta = event.shiftKey ? 1 : 0.1;
    gesture.candidate = moveInPlan(
      gesture.candidate,
      event.key === "ArrowRight"
        ? delta
        : event.key === "ArrowLeft"
          ? -delta
          : 0,
      event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0,
      true,
    );
    setDraft({ ...gesture });
    setNotice("");
  };
  const events = (handle: Handle, id?: string) => ({
    onPointerDown: (event: ReactPointerEvent<SVGElement>) =>
      begin(event, handle, id),
    onKeyDown: (event: KeyboardEvent<SVGElement>) => keys(event, handle, id),
    onKeyUp: (event: KeyboardEvent<SVGElement>) => {
      if (event.key.startsWith("Arrow") && active.current?.keyboard) {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    },
    onBlur: () => {
      if (active.current?.keyboard) finish();
    },
  });
  const displayed = (handle: Handle, original: Vector, id?: string) =>
    draft?.handle === handle && draft.id === id ? draft.candidate : original;
  const project = (position: Vector) => planPoint(position, currentView, size);
  const [cx, cy] = project(displayed("camera", camera.position)),
    [tx, ty] = project(displayed("target", camera.target));
  const floor = planFloor(scene);
  const [gx, gy] = project([floor[0], 0, floor[1]]);
  const spacing =
    currentView.scale *
    (currentView.scale < 4 ? 10 : currentView.scale < 12 ? 5 : 1);
  const [zeroX, zeroY] = project([0, 0, 0]);
  const objects = scene.objects;
  const selected =
    draft?.handle !== "pan" && draft
      ? draft.candidate
      : tool === "camera"
        ? camera.position
        : scene.objects.find((o) => o.id === selectedId)?.transform.position;
  return (
    <div className="plan-view">
      <div
        className="plan-tools"
        role="group"
        aria-label="Værktøjer til sceneplan"
      >
        <button
          aria-pressed={tool === "object"}
          disabled={!!draft}
          onClick={() => setTool("object")}
        >
          Flyt objekter
        </button>
        <button
          aria-pressed={tool === "camera"}
          disabled={!!draft}
          onClick={() => {
            setTool("camera");
            onSelectCamera();
          }}
        >
          Placér kamera
        </button>
        <span className="plan-tool-space" />
        <button
          aria-label="Zoom ud i sceneplan"
          disabled={!!draft}
          onClick={() =>
            setView({
              ...currentView,
              scale: Math.max(0.1, currentView.scale / 1.3),
            })
          }
        >
          −
        </button>
        <button
          aria-label="Zoom ind i sceneplan"
          disabled={!!draft}
          onClick={() =>
            setView({
              ...currentView,
              scale: Math.min(100, currentView.scale * 1.3),
            })
          }
        >
          +
        </button>
        <button disabled={!!draft} onClick={() => setView(null)}>
          Vis hele settet
        </button>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="group"
        aria-label={`2D-plan af ${scene.name} med objekter og kamera`}
        tabIndex={0}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (active.current?.pointerId === event.pointerId) {
            move(event);
            finish();
          }
        }}
        onPointerCancel={(event) => {
          if (active.current?.pointerId === event.pointerId) cancel();
        }}
        onLostPointerCapture={() => {
          if (active.current?.pointerId !== undefined) cancel();
        }}
        {...events("pan")}
      >
        <defs>
          <pattern
            id={gridId}
            x={zeroX % spacing}
            y={zeroY % spacing}
            width={spacing}
            height={spacing}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${spacing} 0 H 0 V ${spacing}`}
              fill="none"
              stroke="#465662"
              strokeWidth=".7"
            />
          </pattern>
        </defs>
        <rect width={size.width} height={size.height} fill="#1c252d" />
        {grid && (
          <rect
            width={size.width}
            height={size.height}
            fill={`url(#${gridId})`}
            pointerEvents="none"
          />
        )}
        <rect
          x={gx}
          y={gy}
          width={floor[2] * currentView.scale}
          height={floor[3] * currentView.scale}
          fill="#15232b55"
          stroke="#7b918e"
          strokeWidth="1.5"
          pointerEvents="none"
        />
        <path
          d={`M ${cx} ${cy} L ${tx} ${ty}`}
          stroke="#e9b487"
          strokeWidth="2"
          strokeDasharray="6 5"
          pointerEvents="none"
        />
        {objects.map((object) => {
          const position = displayed(
              "object",
              object.transform.position,
              object.id,
            ),
            [x, y] = project(position),
            selected = object.id === selectedId;
          return (
            <g
              key={object.id}
              role={tool === "object" ? "button" : undefined}
              tabIndex={tool === "object" ? 0 : undefined}
              aria-label={tool === "object" ? `Flyt ${object.name}` : undefined}
              aria-pressed={tool === "object" ? selected : undefined}
              data-plan-object={object.id}
              data-position={position.join(",")}
              transform={`translate(${x} ${y})`}
              className={`plan-handle ${tool === "object" ? "interactive" : ""}`}
              {...(tool === "object" ? events("object", object.id) : {})}
            >
              <circle r="23" fill="transparent" className="plan-hit" />
              <circle
                r={object.kind === "person" ? 10 : 14}
                fill={object.color}
                stroke={selected ? "#fff5e4" : "#a7b6b7"}
                strokeWidth={selected ? 3 : 1.5}
                pointerEvents="none"
              />
              {!selected && currentView.scale >= 42 && (
                <text
                  y="35"
                  textAnchor="middle"
                  fill="#eef1e8"
                  fontSize="12"
                  pointerEvents="none"
                >
                  {object.name}
                </text>
              )}
            </g>
          );
        })}
        {objects
          .filter((object) => object.id === selectedId)
          .map((object) => {
            const [x, y] = project(
              displayed("object", object.transform.position, object.id),
            );
            return (
              <text
                key={`label-${object.id}`}
                x={x}
                y={y + 35}
                textAnchor="middle"
                fill="#eef1e8"
                stroke="#1c252d"
                strokeWidth="4"
                paintOrder="stroke"
                fontSize="12"
                pointerEvents="none"
              >
                {object.name}
              </text>
            );
          })}
        {(
          [
            ["camera", cx, cy, "Flyt kamera"],
            ["target", tx, ty, "Flyt kameraets sigtepunkt"],
          ] as const
        ).map(([handle, x, y, label]) => (
          <g
            key={handle}
            role={tool === "camera" ? "button" : undefined}
            tabIndex={tool === "camera" ? 0 : undefined}
            aria-label={tool === "camera" ? label : undefined}
            className={`plan-handle ${tool === "camera" ? "interactive" : ""}`}
            transform={`translate(${x} ${y})`}
            data-plan-camera={handle}
            {...(tool === "camera" ? events(handle) : {})}
          >
            <circle r="23" fill="transparent" className="plan-hit" />
            {handle === "camera" ? (
              <path
                d="M -10 -8 H 7 V -4 L 15 -8 V 8 L 7 4 V 8 H -10 Z"
                fill="#e9b487"
                stroke="#19232a"
                strokeWidth="2"
                pointerEvents="none"
              />
            ) : (
              <g stroke="#f7d5aa" strokeWidth="2" pointerEvents="none">
                <circle r="8" fill="#1c252d" />
                <path d="M -13 0 H 13 M 0 -13 V 13" />
              </g>
            )}
            {tool === "camera" && (
              <text
                y="35"
                textAnchor="middle"
                fill="#f5d8b5"
                fontSize="12"
                pointerEvents="none"
              >
                {handle === "camera" ? "Kamera" : "Sigtepunkt"}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="plan-readout">
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(event) => setSnap(event.target.checked)}
            disabled={!!draft}
          />
          0,1 m trin
        </label>
        <span>
          {selected
            ? `X ${selected[0].toFixed(1)} · Z ${selected[2].toFixed(1)} m`
            : "X / Z · meter"}
        </span>
      </div>
      <p className="plan-guidance" role="status">
        <span style={{ visibility: notice ? "hidden" : "visible" }}>
          {(failed ? "2D er aktiv: WebGL er utilgængelig. " : "") +
            "Træk for at placere · piletaster 0,1 m · Shift 1 m · Esc annullér. Træk baggrunden for at panorere."}
        </span>
        <span style={{ visibility: notice ? "visible" : "hidden" }}>
          {notice}
        </span>
      </p>
    </div>
  );
}
