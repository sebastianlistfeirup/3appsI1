"use client";
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Connection,
} from "@xyflow/react";
import {
  ArrowDownToLine,
  CircleCheck,
  GitBranch,
  Hourglass,
  RotateCcw,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FlowModel, FlowNode } from "@tre/flow-engine";
import "@xyflow/react/dist/style.css";
export const nodeIcons: Record<FlowNode["kind"], LucideIcon> = {
  source: ArrowDownToLine,
  activity: Users,
  decision: GitBranch,
  wait: Hourglass,
  rework: RotateCcw,
  sink: CircleCheck,
};
export const nodeLabels: Record<FlowNode["kind"], string> = {
  source: "Ankomst",
  activity: "Aktivitet",
  decision: "Beslutning",
  wait: "Planlagt vent",
  rework: "Genarbejde",
  sink: "Afslutning",
};
type ProcessNode = Node<
  { node: FlowNode; detail: string; index: number },
  "process"
>;
function ProcessCard({ data, selected }: NodeProps<ProcessNode>) {
  const Icon = nodeIcons[data.node.kind];
  return (
    <div
      className={`process-card kind-${data.node.kind} ${selected ? "is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-eyebrow">
        <span className="node-icon">
          <Icon size={19} strokeWidth={1.7} />
        </span>
        <span>{nodeLabels[data.node.kind]}</span>
        <span className="node-index">
          {String(data.index + 1).padStart(2, "0")}
        </span>
      </div>
      <strong>{data.node.label}</strong>
      <div className="node-detail">{data.detail}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { process: ProcessCard };
export default function ModelCanvas({
  model,
  selected,
  onSelect,
  onMove,
  onConnect,
}: {
  model: FlowModel;
  selected: string;
  onSelect: (id: string) => void;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onConnect: (c: Connection) => void;
}) {
  const nodes = useMemo(
    () =>
      model.nodes.map((n, index) => ({
        id: n.id,
        type: "process",
        position: n.position,
        selected: n.id === selected,
        data: {
          node: n,
          index,
          detail:
            n.kind === "source"
              ? model.arrivals.type === "poisson"
                ? `~${Math.round(model.horizon / model.arrivals.meanInterval)} sager / dag`
                : `${model.arrivals.cases.length} kendte ankomster`
              : n.kind === "activity"
                ? `${n.duration?.type === "triangular" ? Math.round(n.duration.mode / 60000) : n.duration?.type === "fixed" ? Math.round(n.duration.value / 60000) : n.duration ? Math.round(n.duration.mean / 60000) : "—"} min · ${model.resources.find((r) => r.id === n.resourceId)?.capacity ?? 0} medarbejdere`
                : n.kind === "decision"
                  ? "Eksplicit routing"
                  : n.kind === "sink"
                    ? "Unikke afsluttede sager"
                    : n.kind === "rework"
                      ? `Højst ${n.maxVisits} besøg`
                      : "Uden ressourceforbrug",
        },
      })),
    [model, selected],
  );
  const edges = useMemo(
    () =>
      model.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "#94aaa8",
        },
        style: { stroke: "#a6bab5", strokeWidth: 1.7 },
        label:
          e.caseType ??
          (e.weight !== undefined
            ? `${Math.round(e.weight * 100)} %`
            : undefined),
        labelStyle: { fill: "#526966", fontSize: 12, fontWeight: 600 },
        labelBgStyle: { fill: "#f7f9f8" },
        labelBgPadding: [7, 5] as [number, number],
      })),
    [model.edges],
  );
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      onNodeDragStop={(_, n) => onMove(n.id, n.position)}
      onConnect={onConnect}
      fitView
      fitViewOptions={{ padding: 0.14, maxZoom: 0.85 }}
      minZoom={0.25}
      maxZoom={1.4}
      nodesConnectable
      edgesFocusable
      elementsSelectable
      proOptions={{ hideAttribution: false }}
      aria-label="Procesmodel. Brug også listeeditoren for fuld tastaturadgang."
      deleteKeyCode={null}
    >
      <Background color="#d6e1dc" gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
