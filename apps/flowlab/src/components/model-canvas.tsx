"use client";
import { useMemo, useEffect } from "react";
import {
  ReactFlow,
  useNodesState,
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
import { formatNumber } from "../lib/document";
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
const nodeDuration = (n: FlowNode) => {
  const ms =
    n.duration?.type === "triangular"
      ? n.duration.mode
      : n.duration?.type === "fixed"
        ? n.duration.value
        : n.duration?.mean;
  return ms === undefined
    ? "—"
    : ms < 60000
      ? `${formatNumber(ms / 1000, 1)} sek`
      : `${formatNumber(ms / 60000, 1)} min`;
};
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
  const modelNodes = useMemo<ProcessNode[]>(
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
                ? `${nodeDuration(n)} · ${model.resources.find((r) => r.id === n.resourceId)?.capacity ?? 0} ${model.resources.find((r) => r.id === n.resourceId)?.capacity === 1 ? "medarbejder" : "medarbejdere"}`
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
  const [nodes, setNodes, onNodesChange] =
    useNodesState<ProcessNode>(modelNodes);
  useEffect(() => setNodes(modelNodes), [modelNodes, setNodes]);
  const edges = useMemo(
    () =>
      model.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "#789387",
        },
        style: { stroke: "#789387", strokeWidth: 1.7 },
        label:
          e.caseType ??
          (e.weight !== undefined
            ? `${Math.round(e.weight * 100)} %`
            : undefined),
        labelStyle: { fill: "#526966", fontSize: 14, fontWeight: 600 },
        labelBgStyle: { fill: "#f7f9f8" },
        labelBgPadding: [7, 5] as [number, number],
      })),
    [model.edges],
  );
  return (
    <ReactFlow
      nodes={nodes}
      onNodesChange={(changes) => {
        onNodesChange(changes);
        for (const change of changes)
          if (
            change.type === "position" &&
            change.position &&
            change.dragging === undefined
          )
            onMove(change.id, change.position);
      }}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      onNodeDragStop={(_, n) => onMove(n.id, n.position)}
      onConnect={onConnect}
      ariaLabelConfig={{
        "controls.ariaLabel": "Diagramvisning",
        "controls.zoomIn.ariaLabel": "Zoom ind",
        "controls.zoomOut.ariaLabel": "Zoom ud",
        "controls.fitView.ariaLabel": "Vis hele modellen",
        "node.a11yDescription.default":
          "Tryk Enter eller mellemrum for at vælge en node. Brug piletasterne for at flytte den. Listeeditoren giver adgang til alle indstillinger.",
      }}
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
