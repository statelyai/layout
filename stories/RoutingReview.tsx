import { useId, useRef, useState, type PointerEvent } from "react";
import { getDiff } from "@statelyai/graph";
import {
  getPathBounds,
  getPathLength,
  routingStrategies,
  toSvgPath,
  type RouteBounds,
  type RoutingCurve,
  type RoutingGraph,
  type RoutingLabel,
  type RoutingSettings,
  type RoutingSnapshot,
  type RoutingTangent,
} from "../src/routing";
import {
  getRoutingQualityFixture,
  routingCurveFamilies,
  routingQualityFixtures,
  type RoutingQualityFixture,
} from "./routing-quality-fixtures";
import "./routing-quality.css";

export interface RoutingReviewModel {
  readonly graph: RoutingGraph;
  readonly snapshot: RoutingSnapshot;
}

export function getRoutingReviewBounds(models: readonly RoutingReviewModel[]): RouteBounds {
  const bounds: RouteBounds[] = [];
  for (const { graph, snapshot } of models) {
    for (const node of graph.nodes) {
      bounds.push({
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? 0,
        height: node.height ?? 0,
      });
    }
    for (const route of snapshot.routes.values()) {
      for (const section of route.sections) bounds.push(getPathBounds(section.path));
      if (route.label) bounds.push(route.label.bounds);
    }
    for (const edge of graph.edges) {
      if (edge.width && edge.height) {
        const label = snapshot.routes.get(edge.id)?.label?.bounds;
        if (!label)
          bounds.push({ x: edge.x ?? 0, y: edge.y ?? 0, width: edge.width, height: edge.height });
      }
    }
  }
  const x = Math.min(0, ...bounds.map((item) => item.x)) - 32;
  const y = Math.min(0, ...bounds.map((item) => item.y)) - 32;
  return {
    x,
    y,
    width: Math.max(560, ...bounds.map((item) => item.x + item.width)) - x + 32,
    height: Math.max(340, ...bounds.map((item) => item.y + item.height)) - y + 32,
  };
}

function unionBounds(a: RouteBounds, b: RouteBounds): RouteBounds {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function RoutingQualityCanvas({
  graph,
  snapshot,
  bounds,
  onStart,
  onMove,
  onEnd,
}: RoutingReviewModel & {
  bounds: RouteBounds;
  onStart?: (event: PointerEvent<SVGGElement>, id: string) => void;
  onMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onEnd?: () => void;
}) {
  const markerId = useId().replace(/:/g, "");
  const shared = new Set<string>();
  const terminals = new Set(graph.edges.flatMap((edge) => [edge.sourceId, edge.targetId]));
  return (
    <svg
      className="routing-review-canvas"
      data-testid="routing-policy-canvas"
      aria-label="Routing canvas"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 -4 9 8"
          refX={8}
          refY={0}
          markerWidth={9}
          markerHeight={8}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 -4 L 8 0 L 0 4 Z" fill="context-stroke" />
        </marker>
      </defs>
      {[...snapshot.routes.values()].flatMap((route) => {
        const edge = graph.edges.find((item) => item.id === route.edgeId);
        return route.sections.map((section) => {
          if (section.sharedId && shared.has(section.sharedId)) return null;
          if (section.sharedId) shared.add(section.sharedId);
          const isTarget = section.to.kind === "node" && section.to.nodeId === edge?.targetId;
          return (
            <path
              key={`${route.edgeId}:${section.id}`}
              data-edge={route.edgeId}
              data-status={route.status}
              data-target={isTarget ? "true" : undefined}
              d={toSvgPath(section.path)}
              fill="none"
              stroke={route.status === "fallback" ? "#ae5319" : "#345eaa"}
              strokeWidth={2.3}
              strokeLinejoin="round"
              strokeDasharray={route.status === "fallback" ? "6 4" : undefined}
              markerEnd={isTarget ? `url(#${markerId})` : undefined}
            />
          );
        });
      })}
      {graph.nodes.map((node) => {
        const x = node.x ?? 0,
          y = node.y ?? 0,
          width = node.width ?? 0,
          height = node.height ?? 0;
        return (
          <g
            key={node.id}
            data-node={node.id}
            onPointerDown={(event) => onStart?.(event, node.id)}
            style={{ cursor: onStart ? "grab" : undefined }}
          >
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={6}
              fill={terminals.has(node.id) ? "#ffffff" : "#e9e3da"}
              stroke={terminals.has(node.id) ? "#71809b" : "#a89479"}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              dominantBaseline="central"
              textAnchor="middle"
              className="routing-node-label"
            >
              {node.id}
            </text>
            {node.ports?.map((port) => (
              <circle
                key={port.name}
                cx={x + (port.x ?? 0) + (port.width ?? 0) / 2}
                cy={y + (port.y ?? 0) + (port.height ?? 0) / 2}
                r={3.5}
                fill="#345eaa"
                stroke="white"
              >
                <title>{port.name}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {graph.edges
        .filter((edge) => edge.width && edge.height)
        .map((edge) => {
          const label = snapshot.routes.get(edge.id)?.label?.bounds ?? {
            x: edge.x ?? 0,
            y: edge.y ?? 0,
            width: edge.width ?? 0,
            height: edge.height ?? 0,
          };
          return (
            <g key={edge.id} data-label={edge.id}>
              <rect {...label} rx={4} fill="white" fillOpacity={0.96} stroke="#9275a1" />
              <text
                x={label.x + label.width / 2}
                y={label.y + label.height / 2}
                dominantBaseline="central"
                textAnchor="middle"
                className="routing-edge-label"
              >
                {edge.id === "edge" ? "Label" : edge.id}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

function RouteDiagnostics({ snapshot }: { snapshot: RoutingSnapshot }) {
  const diagnostics = [...snapshot.routes.values()].flatMap((route) =>
    route.diagnostics.map((diagnostic, index) => ({
      ...diagnostic,
      key: `${route.edgeId}:${index}`,
    })),
  );
  return (
    <details className="routing-diagnostics" open={diagnostics.length > 0}>
      <summary>
        {diagnostics.length ? `${diagnostics.length} route diagnostics` : "No route diagnostics"}
      </summary>
      <ul aria-label="Route diagnostics">
        {diagnostics.map((diagnostic) => (
          <li key={diagnostic.key}>
            <strong>{diagnostic.edgeId}</strong> · {diagnostic.code} · {diagnostic.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

function RouteMetrics({ snapshot }: { snapshot: RoutingSnapshot }) {
  const routes = [...snapshot.routes.values()];
  const sections = routes.flatMap((route) => route.sections);
  const length = sections.reduce((sum, section) => sum + getPathLength(section.path), 0);
  return (
    <p className="routing-route-metrics">
      {routes.length} edges · {sections.length} sections · {Math.round(length)} total length ·{" "}
      {routes.filter((route) => route.status === "fallback").length} fallbacks
    </p>
  );
}

function svgPoint(event: PointerEvent<SVGElement>) {
  const svg =
    event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
  const transform = svg?.getScreenCTM();
  if (!svg || !transform) return undefined;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(transform.inverse());
}

const labelModes: readonly RoutingLabel["kind"][] = ["follow", "fixed", "through", "gap"];
const tangentModes: readonly RoutingTangent["kind"][] = ["automatic", "border-normal", "vector"];
const stabilityModes = ["recompute", "preserve-valid"] satisfies NonNullable<
  NonNullable<RoutingSettings["policy"]>["stability"]
>["kind"][];

function RoutingReviewSession({
  fixture,
  selectExample,
}: {
  fixture: RoutingQualityFixture;
  selectExample?: (id: string) => void;
}) {
  const [before, setBefore] = useState(false);
  const [model, setModel] = useState(() => {
    const snapshot = routingStrategies[fixture.strategy].route(fixture.graph, fixture.settings);
    return {
      graph: fixture.graph,
      settings: fixture.settings,
      snapshot,
      patches: 0,
      bounds: getRoutingReviewBounds([{ graph: fixture.graph, snapshot }]),
    };
  });
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  function reset(settings = model.settings) {
    const snapshot = routingStrategies[fixture.strategy].route(fixture.graph, settings);
    setModel({
      graph: fixture.graph,
      settings,
      snapshot,
      patches: 0,
      bounds: getRoutingReviewBounds([{ graph: fixture.graph, snapshot }]),
    });
    drag.current = null;
  }
  function configure(policy: NonNullable<RoutingSettings["policy"]>) {
    const settings = { ...model.settings, policy: { ...model.settings.policy, ...policy } };
    const snapshot = routingStrategies[fixture.strategy].route(model.graph, settings);
    setBefore(false);
    setModel({
      ...model,
      settings,
      snapshot,
      patches: 0,
      bounds: unionBounds(model.bounds, getRoutingReviewBounds([{ graph: model.graph, snapshot }])),
    });
  }
  function move(id: string, x: number, y: number) {
    setModel((previous) => {
      const graph = {
        ...previous.graph,
        nodes: previous.graph.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
      };
      const result = routingStrategies[fixture.strategy].update(
        graph,
        previous.snapshot,
        getDiff(previous.graph, graph),
        previous.settings,
      );
      return {
        ...previous,
        graph,
        snapshot: result.snapshot,
        patches: result.patches.length,
        bounds: unionBounds(
          previous.bounds,
          getRoutingReviewBounds([{ graph, snapshot: result.snapshot }]),
        ),
      };
    });
  }
  const policy = model.settings.policy;
  return (
    <main className="routing-review routing-review-session">
      <header>
        <p className="routing-eyebrow">Routing policies / {fixture.strategy}</p>
        <h1>{fixture.title}</h1>
        <p>{fixture.description}</p>
      </header>
      <div className="routing-review-toolbar">
        {selectExample ? (
          <label>
            Example{" "}
            <select
              aria-label="Example"
              value={fixture.id}
              onChange={(event) => selectExample(event.target.value)}
            >
              {routingQualityFixtures.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {fixture.before ? (
          <label>
            <input
              type="checkbox"
              checked={before}
              onChange={(event) => {
                setBefore(event.target.checked);
                reset(event.target.checked ? fixture.before : fixture.settings);
              }}
            />{" "}
            Original settings
          </label>
        ) : null}
        <button
          onClick={() => {
            setBefore(false);
            reset(fixture.settings);
          }}
        >
          Reset
        </button>
        <button
          onClick={() => {
            const sourceId = model.graph.edges[0]?.sourceId;
            const node = model.graph.nodes.find((item) => item.id === sourceId);
            if (node) move(node.id, node.x ?? 0, (node.y ?? 0) + 30);
          }}
        >
          Move source
        </button>
        {fixture.obstacleId ? (
          <button
            onClick={() => {
              const node = model.graph.nodes.find((item) => item.id === fixture.obstacleId);
              const original = fixture.graph.nodes.find((item) => item.id === fixture.obstacleId);
              if (node && original)
                move(
                  node.id,
                  (original.x ?? 0) + 25,
                  node.y === original.y ? (original.y ?? 0) - 65 : (original.y ?? 0),
                );
            }}
          >
            Move obstacle
          </button>
        ) : null}
      </div>
      <details className="routing-policy-controls">
        <summary>Policy controls</summary>
        <div className="routing-review-toolbar">
          <label>
            Curve family{" "}
            <select
              aria-label="Curve family"
              value={policy?.curve?.kind ?? ""}
              onChange={(event) => {
                const curve = routingCurveFamilies.find((item) => item.kind === event.target.value);
                if (curve) configure({ curve });
              }}
            >
              <option value="" disabled>
                Strategy default
              </option>
              {routingCurveFamilies.map((item) => (
                <option key={item.kind}>{item.kind}</option>
              ))}
            </select>
          </label>
          <label>
            Endpoint tangents{" "}
            <select
              aria-label="Endpoint tangents"
              value={
                policy?.sourceTangent?.kind === policy?.targetTangent?.kind
                  ? (policy?.sourceTangent?.kind ?? "")
                  : "mixed"
              }
              onChange={(event) => {
                const mode = tangentModes.find((item) => item === event.target.value);
                if (mode) {
                  const tangent: RoutingTangent =
                    mode === "vector"
                      ? { kind: mode, direction: { x: 1, y: 0.6 } }
                      : { kind: mode };
                  configure({ sourceTangent: tangent, targetTangent: tangent });
                }
              }}
            >
              <option value="" disabled>
                Strategy default
              </option>
              <option value="mixed" disabled>
                Mixed endpoints
              </option>
              {tangentModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label>
            Label mode{" "}
            <select
              aria-label="Label mode"
              value={policy?.label?.kind ?? ""}
              onChange={(event) => {
                const kind = labelModes.find((item) => item === event.target.value);
                if (kind) configure({ label: { kind } });
              }}
            >
              <option value="" disabled>
                Strategy default
              </option>
              {labelModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label>
            Crossing penalty{" "}
            <input
              aria-label="Crossing penalty"
              type="number"
              min={0}
              step={40}
              value={policy?.collisions?.crossingPenalty ?? model.settings.crossingPenalty ?? 80}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value) && value >= 0)
                  configure({ collisions: { ...policy?.collisions, crossingPenalty: value } });
              }}
            />
          </label>
          <label>
            Stability{" "}
            <select
              aria-label="Stability"
              value={policy?.stability?.kind ?? "recompute"}
              onChange={(event) => {
                const kind = stabilityModes.find((item) => item === event.target.value);
                if (kind) configure({ stability: { kind } });
              }}
            >
              {stabilityModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <p role="status">
        Revision {model.snapshot.revision} · {model.snapshot.metrics.routedEdges} recomputed ·{" "}
        {model.snapshot.metrics.reusedEdges} reused · {model.patches} patches ·{" "}
        {model.snapshot.metrics.searchNodes} search visits
      </p>
      <RoutingQualityCanvas
        graph={model.graph}
        snapshot={model.snapshot}
        bounds={model.bounds}
        onStart={(event, id) => {
          const point = svgPoint(event);
          const node = model.graph.nodes.find((item) => item.id === id);
          if (!point || !node) return;
          drag.current = { id, dx: point.x - (node.x ?? 0), dy: point.y - (node.y ?? 0) };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onMove={(event) => {
          const point = svgPoint(event);
          if (point && drag.current)
            move(drag.current.id, point.x - drag.current.dx, point.y - drag.current.dy);
        }}
        onEnd={() => {
          drag.current = null;
        }}
      />
      <p className="routing-canvas-help">
        Drag any node. Blue arrows mark edge targets. Dashed orange routes are fallbacks. Canvas
        expands to retain the complete route.
      </p>
      <RouteMetrics snapshot={model.snapshot} />
      <RouteDiagnostics snapshot={model.snapshot} />
      <details className="routing-settings">
        <summary>Settings</summary>
        <pre>{JSON.stringify(model.settings, null, 2)}</pre>
      </details>
    </main>
  );
}

export function RoutingReviewScenario({
  fixtureId = "midpoint",
  playground = false,
}: {
  fixtureId?: string;
  playground?: boolean;
}) {
  return (
    <RoutingReviewSelection key={fixtureId} initialFixtureId={fixtureId} playground={playground} />
  );
}
function RoutingReviewSelection({
  initialFixtureId,
  playground,
}: {
  initialFixtureId: string;
  playground: boolean;
}) {
  const [fixtureId, setFixtureId] = useState(initialFixtureId);
  const fixture = getRoutingQualityFixture(fixtureId);
  return (
    <RoutingReviewSession
      key={fixtureId}
      fixture={fixture}
      selectExample={playground ? setFixtureId : undefined}
    />
  );
}

export function RoutingComparison({
  title,
  description,
  fixtures,
}: {
  title: string;
  description: string;
  fixtures: readonly RoutingQualityFixture[];
}) {
  const models = fixtures.map((fixture) => ({
    fixture,
    graph: fixture.graph,
    snapshot: routingStrategies[fixture.strategy].route(fixture.graph, fixture.settings),
  }));
  const bounds = getRoutingReviewBounds(models);
  return (
    <main className="routing-review">
      <header>
        <p className="routing-eyebrow">Routing quality review</p>
        <h1>{title}</h1>
        <p>{description} All panels share one viewBox and scale.</p>
      </header>
      <div className="routing-review-grid">
        {models.map(({ fixture, graph, snapshot }) => (
          <section className="routing-review-panel" key={fixture.id}>
            <header>
              <h2>{fixture.title}</h2>
              <p>
                {fixture.strategy} · {fixture.settings.policy?.curve?.kind ?? "default curve"}
              </p>
            </header>
            <RoutingQualityCanvas graph={graph} snapshot={snapshot} bounds={bounds} />
            <RouteMetrics snapshot={snapshot} />
            <RouteDiagnostics snapshot={snapshot} />
          </section>
        ))}
      </div>
    </main>
  );
}

export function curveComparisonFixtures(
  fixture: RoutingQualityFixture,
): readonly RoutingQualityFixture[] {
  return routingCurveFamilies.map((curve: RoutingCurve) => ({
    ...fixture,
    id: `${fixture.id}-${curve.kind}`,
    title: curve.kind,
    settings: { ...fixture.settings, policy: { ...fixture.settings.policy, curve } },
  }));
}
