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
import { diagramHandles, diagramNodeDetail } from "../lib/diagram";
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
  {
    node: FlowNode;
    detail: { primary: string; secondary?: string };
    index: number;
  },
  "process"
>;
const directions = [
  Position.Left,
  Position.Right,
  Position.Top,
  Position.Bottom,
];
function ProcessCard({ data, selected }: NodeProps<ProcessNode>) {
  const Icon = nodeIcons[data.node.kind];
  return (
    <div
      className={`process-card kind-${data.node.kind} ${selected ? "is-selected" : ""}`}
    >
      {(["target", "source"] as const).flatMap((type) =>
        directions.map((position) => {
          const primary =
            type === "target"
              ? position === Position.Left
              : position === Position.Right;
          return (
            <Handle
              key={`${type}-${position}`}
              id={`${type}-${position}`}
              type={type}
              position={position}
              isConnectable={primary}
              className={primary ? "primary-port" : "routing-port"}
              aria-hidden={!primary}
              title={
                primary
                  ? `${type === "source" ? "Forbind fra" : "Forbind til"} ${data.node.label}`
                  : undefined
              }
            />
          );
        }),
      )}
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
      <div className="node-detail">{data.detail.primary}</div>
      {data.detail.secondary && (
        <div className="node-detail node-detail-secondary">
          {data.detail.secondary}
        </div>
      )}
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
        ariaLabel: `${nodeLabels[n.kind]}: ${n.label}`,
        data: {
          node: n,
          index,
          detail: diagramNodeDetail(n, model),
        },
      })),
    [model, selected],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<ProcessNode>(modelNodes);
  useEffect(() => {
    // Retain React Flow's measured dimensions while applying model changes.
    // Resetting them briefly hides the focused node and WebKit drops keyboard focus.
    setNodes((current) => {
      const prior = new Map(current.map((node) => [node.id, node]));
      return modelNodes.map((node) => ({ ...prior.get(node.id), ...node }));
    });
  }, [modelNodes, setNodes]);
  const edges = useMemo(() => {
    // Follow live positions during a drag as well as persisted keyboard moves.
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    const names = new Map(model.nodes.map((node) => [node.id, node.label]));
    return model.edges.map((edge) => {
      const source = positions.get(edge.source),
        target = positions.get(edge.target);
      const label =
        edge.caseType ??
        (edge.weight !== undefined
          ? `${Math.round(edge.weight * 100)} %`
          : undefined);
      return {
        ...edge,
        ...(source && target
          ? diagramHandles(source, target, edge.source === edge.target)
          : {}),
        type: "smoothstep",
        pathOptions: { offset: 10 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "#789387",
        },
        style: { stroke: "#789387", strokeWidth: 1.7 },
        label,
        ariaLabel: `Fra ${names.get(edge.source) ?? edge.source} til ${names.get(edge.target) ?? edge.target}${label ? `, ${label}` : ""}`,
        labelStyle: { fill: "#526966", fontSize: 14, fontWeight: 600 },
        labelBgStyle: { fill: "#f7f9f8" },
        labelBgPadding: [7, 5] as [number, number],
      };
    });
  }, [model.edges, model.nodes, nodes]);
  return (
    <ReactFlow
      nodes={nodes}
      onNodesChange={(changes) => {
        onNodesChange(changes);
        for (const change of changes) {
          if (change.type === "select" && change.selected) onSelect(change.id);
          if (
            change.type === "position" &&
            change.position &&
            change.dragging !== true
          )
            onMove(change.id, change.position);
        }
      }}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      onConnect={onConnect}
      ariaLabelConfig={{
        "controls.ariaLabel": "Diagramvisning",
        "controls.zoomIn.ariaLabel": "Zoom ind",
        "controls.zoomOut.ariaLabel": "Zoom ud",
        "controls.fitView.ariaLabel": "Vis hele modellen",
        "node.a11yDescription.default":
          "Tryk Enter eller mellemrum for at vælge en node. Brug piletasterne for at flytte den. Listeeditoren giver adgang til alle indstillinger.",
        "node.a11yDescription.keyboardDisabled":
          "Tryk Enter eller mellemrum for at vælge en node. Brug piletasterne for at flytte den. Listeeditoren giver adgang til alle indstillinger.",
        "node.a11yDescription.ariaLiveMessage": ({ direction }) =>
          `Den valgte node flyttes ${{ left: "mod venstre", right: "mod højre", up: "op", down: "ned" }[direction] ?? direction}.`,
        "edge.a11yDescription.default":
          "Forbindelsen kan ændres eller fjernes gennem nodens indstillinger i listeeditoren. Enter eller mellemrum vælger forbindelsen; Escape fjerner valget.",
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
