import { useRef, useState, type PointerEvent } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createGraph, type GraphDiff } from "@statelyai/graph";
import {
  routingStrategies,
  flattenPath,
  pathFromPoints,
  toSvgPath,
  type RouteStyle,
  type RoutingGraph,
  type RoutingSnapshot,
} from "../src/routing";

function fixture() {
  return createGraph({
    id: "routing-playground",
    nodes: [
      { id: "Start", x: 30, y: 80, width: 80, height: 44 },
      { id: "Review", x: 380, y: 40, width: 80, height: 44 },
      { id: "Publish", x: 380, y: 230, width: 80, height: 44 },
      { id: "Obstacle", x: 200, y: 60, width: 70, height: 110 },
      { id: "Independent", x: 30, y: 360, width: 100, height: 44 },
      { id: "Done", x: 380, y: 360, width: 80, height: 44 },
    ],
    edges: [
      { id: "review", sourceId: "Start", targetId: "Review" },
      {
        id: "publish",
        sourceId: "Start",
        targetId: "Publish",
        x: 210,
        y: 240,
        width: 72,
        height: 26,
      },
      { id: "parallel", sourceId: "Start", targetId: "Review" },
      { id: "loop", sourceId: "Publish", targetId: "Publish" },
      { id: "independent", sourceId: "Independent", targetId: "Done" },
    ],
  });
}
function initial(style: RouteStyle) {
  const graph = fixture();
  return { graph, snapshot: routingStrategies[style].route(graph), patches: 0 };
}
function RoutingPlayground() {
  const [style, setStyle] = useState<RouteStyle>("orthogonal");
  const [model, setModel] = useState(() => initial("orthogonal"));
  const [flattened, setFlattened] = useState(false);
  const drag = useRef<{ id: string; label: boolean; dx: number; dy: number } | null>(null);
  function update(id: string, label: boolean, x: number, y: number) {
    setModel((previous) => {
      const entity = (label ? previous.graph.edges : previous.graph.nodes).find(
        (n) => n.id === id,
      )!;
      const next: RoutingGraph = {
        ...previous.graph,
        ...(label
          ? { edges: previous.graph.edges.map((e) => (e.id === id ? { ...e, x, y } : e)) }
          : { nodes: previous.graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }),
      };
      const diff: GraphDiff = {
        nodes: { added: [], removed: [], updated: [] },
        edges: { added: [], removed: [], updated: [] },
      };
      (label ? diff.edges : diff.nodes).updated.push({
        id,
        old: { x: entity.x, y: entity.y },
        new: { x, y },
      });
      const result = routingStrategies[style].update(next, previous.snapshot, diff);
      return { graph: next, snapshot: result.snapshot, patches: result.patches.length };
    });
  }
  function point(event: PointerEvent<SVGElement>) {
    const svg =
      event.currentTarget instanceof SVGSVGElement
        ? event.currentTarget
        : event.currentTarget.ownerSVGElement!;
    const p = svg.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function start(event: PointerEvent<SVGGElement>, id: string, label = false) {
    const p = point(event),
      entity = (label ? model.graph.edges : model.graph.nodes).find((n) => n.id === id)!;
    drag.current = { id, label, dx: p.x - entity.x!, dy: p.y - entity.y! };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  const counts = model.snapshot.metrics;
  return (
    <main style={{ font: "14px system-ui", color: "#17233b", padding: 24, maxWidth: 1000 }}>
      <h1>Incremental routing</h1>
      <p>
        Drag nodes or the publish label. Orange dashed paths are explicit fallbacks. Independent
        routes stay unchanged.
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Strategy{" "}
          <select
            value={style}
            onChange={(e) => {
              const value = e.target.value as RouteStyle;
              setStyle(value);
              setModel(initial(value));
            }}
          >
            {Object.keys(routingStrategies).map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={flattened}
            onChange={(e) => setFlattened(e.target.checked)}
          />{" "}
          Lines-only renderer
        </label>
        <button onClick={() => setModel(initial(style))}>Reset</button>
        <button onClick={() => update("Obstacle", false, 150, 90)}>Move obstacle</button>
        <button onClick={() => update("publish", true, 270, 180)}>Move label</button>
      </div>
      <p role="status">
        Revision {model.snapshot.revision} · {counts.routedEdges} recomputed · {counts.reusedEdges}{" "}
        reused · {model.patches} patches · {counts.searchNodes} search visits
      </p>
      <Canvas
        graph={model.graph}
        snapshot={model.snapshot}
        flattened={flattened}
        onStart={start}
        onMove={(event) => {
          if (!drag.current) return;
          const p = point(event);
          update(drag.current.id, drag.current.label, p.x - drag.current.dx, p.y - drag.current.dy);
        }}
        onEnd={() => {
          drag.current = null;
        }}
      />
      <ul>
        {[...model.snapshot.routes.values()]
          .filter((r) => r.status === "fallback")
          .map((route) => (
            <li key={route.edgeId}>
              {route.edgeId}: {route.diagnostics.map((d) => d.code).join(", ")}
            </li>
          ))}
      </ul>
    </main>
  );
}
function Canvas({
  graph,
  snapshot,
  flattened = false,
  onStart,
  onMove,
  onEnd,
}: {
  graph: RoutingGraph;
  snapshot: RoutingSnapshot;
  flattened?: boolean;
  onStart?: (e: PointerEvent<SVGGElement>, id: string, label?: boolean) => void;
  onMove?: (e: PointerEvent<SVGSVGElement>) => void;
  onEnd?: () => void;
}) {
  const shared = new Set<string>();
  return (
    <svg
      viewBox="0 0 620 450"
      aria-label="Routing canvas"
      style={{
        width: "100%",
        background: "#f7f9fc",
        border: "1px solid #d5dcea",
        borderRadius: 8,
        touchAction: "none",
      }}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
    >
      {[...snapshot.routes.values()].flatMap((route) =>
        route.sections.map((section) => {
          if (section.sharedId && shared.has(section.sharedId)) return null;
          if (section.sharedId) shared.add(section.sharedId);
          return (
            <path
              key={section.id}
              data-edge={route.edgeId}
              data-status={route.status}
              d={toSvgPath(
                flattened
                  ? pathFromPoints(flattenPath(section.path, { tolerance: 0.75 }))
                  : section.path,
              )}
              fill="none"
              stroke={route.status === "fallback" ? "#b85a00" : "#3866c4"}
              strokeWidth={2}
              strokeDasharray={route.status === "fallback" ? "6 4" : undefined}
            />
          );
        }),
      )}
      {graph.nodes.map((node) => (
        <g
          key={node.id}
          onPointerDown={(e) => onStart?.(e, node.id)}
          style={{ cursor: "grab" }}
          data-node={node.id}
        >
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={6}
            fill={node.id === "Obstacle" ? "#e2e7ee" : "white"}
            stroke="#74839a"
          />
          <text
            x={node.x! + node.width! / 2}
            y={node.y! + node.height! / 2 + 4}
            textAnchor="middle"
            style={{ font: "12px system-ui", userSelect: "none" }}
          >
            {node.id}
          </text>
        </g>
      ))}
      {graph.edges
        .filter((e) => (e.width ?? 0) > 0)
        .map((edge) => (
          <g
            key={edge.id}
            onPointerDown={(e) => onStart?.(e, edge.id, true)}
            style={{ cursor: "grab" }}
          >
            <rect
              x={edge.x}
              y={edge.y}
              width={edge.width}
              height={edge.height}
              rx={4}
              fill="#eaf0fe"
              stroke="#3866c4"
            />
            <text
              x={edge.x! + edge.width! / 2}
              y={edge.y! + edge.height! / 2 + 4}
              textAnchor="middle"
              style={{ font: "12px system-ui", userSelect: "none" }}
            >
              {edge.id}
            </text>
          </g>
        ))}
    </svg>
  );
}
const meta = {
  title: "Routing/Incremental",
  component: RoutingPlayground,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RoutingPlayground>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Catalog: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(240px, 1fr))",
        gap: 16,
        padding: 16,
      }}
    >
      {Object.keys(routingStrategies).map((id) => {
        const model = initial(id as RouteStyle);
        return (
          <section key={id}>
            <h2 style={{ font: "16px system-ui" }}>{id}</h2>
            <Canvas graph={model.graph} snapshot={model.snapshot} />
          </section>
        );
      })}
    </div>
  ),
};
