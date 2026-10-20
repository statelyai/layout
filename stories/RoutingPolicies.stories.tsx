import { useRef, useState, type PointerEvent } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { getDiff } from "@statelyai/graph";
import {
  routingStrategies,
  toSvgPath,
  type RoutingGraph,
  type RoutingSettings,
} from "../src/routing";
import { routingPolicyFixtures, routingPolicySettings } from "../scripts/routing-policy-fixtures";

function RoutingPoliciesPlayground() {
  const [fixtureId, setFixtureId] = useState("midpoint");
  const fixture = routingPolicyFixtures.find((item) => item.id === fixtureId)!;
  const [model, setModel] = useState(() => {
    const first = routingPolicyFixtures[0]!;
    const settings = routingPolicySettings[first.id]!;
    return {
      graph: first.graph,
      settings,
      snapshot: routingStrategies[first.strategy].route(first.graph, settings),
      patches: 0,
    };
  });
  const [before, setBefore] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  function reset(id = fixtureId, original = before) {
    const item = routingPolicyFixtures.find((value) => value.id === id)!;
    const settings: RoutingSettings = original ? item.before : routingPolicySettings[id]!;
    setModel({
      graph: item.graph,
      settings,
      snapshot: routingStrategies[item.strategy].route(item.graph, settings),
      patches: 0,
    });
  }
  function point(event: PointerEvent<SVGElement>) {
    const svg =
      event.currentTarget instanceof SVGSVGElement
        ? event.currentTarget
        : event.currentTarget.ownerSVGElement!;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function move(id: string, x: number, y: number) {
    setModel((previous) => {
      const graph: RoutingGraph = {
        ...previous.graph,
        nodes: previous.graph.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
      };
      const result = routingStrategies[fixture.strategy].update(
        graph,
        previous.snapshot,
        getDiff(previous.graph, graph),
        previous.settings,
      );
      return { ...previous, graph, snapshot: result.snapshot, patches: result.patches.length };
    });
  }
  const shared = new Set<string>();
  const paths = [...model.snapshot.routes.values()].flatMap((route) =>
    route.sections
      .filter((section) => {
        if (!section.sharedId) return true;
        if (shared.has(section.sharedId)) return false;
        shared.add(section.sharedId);
        return true;
      })
      .map((section) => (
        <path
          key={`${route.edgeId}:${section.id}`}
          data-edge={route.edgeId}
          d={toSvgPath(section.path)}
          fill="none"
          stroke={route.status === "fallback" ? "#bb6821" : "#3158aa"}
          strokeWidth={2.5}
        />
      )),
  );
  return (
    <main style={{ maxWidth: 1000, padding: 28, color: "#26334d", font: "14px system-ui" }}>
      <h1>Routing policies</h1>
      <p>Choose an example. Drag nodes to inspect incremental routing and label placement.</p>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <label>
          Example{" "}
          <select
            aria-label="Example"
            value={fixtureId}
            onChange={(event) => {
              setFixtureId(event.target.value);
              reset(event.target.value);
            }}
          >
            {routingPolicyFixtures.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={before}
            onChange={(event) => {
              setBefore(event.target.checked);
              reset(fixtureId, event.target.checked);
            }}
          />{" "}
          Original settings
        </label>
        <button onClick={() => reset()}>Reset</button>
        <button
          onClick={() => {
            const node = model.graph.nodes.find((item) => item.id === "a")!;
            move("a", node.x!, node.y! + 30);
          }}
        >
          Move source
        </button>
      </div>
      <p role="status">
        Revision {model.snapshot.revision} · {model.snapshot.metrics.routedEdges} recomputed ·{" "}
        {model.snapshot.metrics.reusedEdges} reused · {model.patches} patches
      </p>
      <svg
        data-testid="routing-policy-canvas"
        viewBox="0 0 560 340"
        width={840}
        height={510}
        style={{
          background: "#fff",
          border: "1px solid #c9d0dc",
          borderRadius: 8,
          touchAction: "none",
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const p = point(event);
          move(drag.current.id, p.x - drag.current.dx, p.y - drag.current.dy);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {paths}
        {model.graph.nodes.map((node) => (
          <g
            key={node.id}
            data-node={node.id}
            style={{ cursor: "grab" }}
            onPointerDown={(event) => {
              const p = point(event);
              drag.current = { id: node.id, dx: p.x - node.x!, dy: p.y - node.y! };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={6}
              fill={node.id === "obstacle" ? "#f6e6dc" : "#eef2f8"}
              stroke="#71809b"
            />
            <text
              x={node.x! + node.width! / 2}
              y={node.y! + node.height! / 2 + 5}
              textAnchor="middle"
              style={{ userSelect: "none" }}
            >
              {node.id}
            </text>
          </g>
        ))}
        {model.graph.edges
          .filter((edge) => edge.width && edge.height)
          .map((edge) => {
            const bounds = model.snapshot.routes.get(edge.id)?.label?.bounds ?? edge;
            return (
              <g key={edge.id} data-label={edge.id}>
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                  rx={4}
                  fill="white"
                  stroke="#9b80ad"
                />
                <text
                  x={bounds.x! + bounds.width! / 2}
                  y={bounds.y! + bounds.height! / 2 + 5}
                  textAnchor="middle"
                >
                  Label
                </text>
              </g>
            );
          })}
      </svg>
      <ul aria-label="Route diagnostics">
        {[...model.snapshot.routes.values()].flatMap((route) =>
          route.diagnostics.map((diagnostic, index) => (
            <li key={`${route.edgeId}:${index}`}>
              {route.edgeId}: {diagnostic.message}
            </li>
          )),
        )}
      </ul>
      <details>
        <summary>Settings</summary>
        <pre>{JSON.stringify(model.settings, null, 2)}</pre>
      </details>
    </main>
  );
}

const meta = {
  title: "Routing/Policies",
  component: RoutingPoliciesPlayground,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RoutingPoliciesPlayground>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
