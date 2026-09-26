import { useEffect, useId, useMemo, useState } from "react";
import type { VisualGraph } from "@statelyai/graph";
import { getLayout, type LayoutResult } from "../src";
import { authoringRequest, descriptions, type AuthoringControls } from "./authoring-fixtures";

function Diagram({
  graph,
  selectedNodes,
  selectedEdges,
  groupA,
  groupB,
  label,
}: {
  graph: VisualGraph;
  selectedNodes: readonly string[];
  selectedEdges: readonly string[];
  groupA: string;
  groupB: string;
  label: string;
}) {
  const arrow = useId();
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const offset = (id: string): { x: number; y: number } => {
    const node = nodes.get(id)!;
    if (!node.parentId) return { x: 0, y: 0 };
    const parent = nodes.get(node.parentId)!;
    const ancestor = offset(parent.id);
    return { x: ancestor.x + parent.x, y: ancestor.y + parent.y };
  };
  const membership = (id: string) =>
    groupA
      .split(",")
      .map((s) => s.trim())
      .includes(id)
      ? "group-a"
      : groupB
            .split(",")
            .map((s) => s.trim())
            .includes(id)
        ? "group-b"
        : "";
  return (
    <svg className="authoring-graph" viewBox="0 0 640 380" role="img" aria-label={label}>
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10" fill="currentColor" />
        </marker>
      </defs>
      {graph.nodes.map((node) => {
        const p = offset(node.id);
        return (
          <g
            key={node.id}
            data-node-id={node.id}
            transform={`translate(${node.x + p.x},${node.y + p.y})`}
            className={selectedNodes.includes(node.id) ? "selected-node" : "fixed-node"}
          >
            <rect width={node.width} height={node.height} rx="5" />
            <text
              x={node.width / 2}
              y={
                nodes.size > 0 && graph.nodes.some((n) => n.parentId === node.id)
                  ? 18
                  : node.height / 2 + 4
              }
              textAnchor="middle"
            >
              {node.id}
            </text>
          </g>
        );
      })}
      {graph.edges.map((edge) => {
        const source = nodes.get(edge.sourceId)!,
          target = nodes.get(edge.targetId)!;
        const p =
          (source.parentId ?? null) === (target.parentId ?? null)
            ? offset(source.id)
            : { x: 0, y: 0 };
        return (
          <g
            key={edge.id}
            data-edge-id={edge.id}
            transform={`translate(${p.x},${p.y})`}
            className={selectedEdges.includes(edge.id) ? "selected-edge" : "fixed-edge"}
          >
            <polyline
              points={(edge.points ?? []).map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              markerEnd={`url(#${arrow})`}
            />
            {edge.width > 0 && (
              <g className={`edge-label ${membership(edge.id)}`}>
                <rect x={edge.x} y={edge.y} width={edge.width} height={edge.height} rx="4" />
                <text
                  x={edge.x + edge.width / 2}
                  y={edge.y + edge.height / 2 + 4}
                  textAnchor="middle"
                >
                  {edge.id}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function AuthoringPlayground(initial: AuthoringControls) {
  const [controls, setControls] = useState(initial);
  const [state, setState] = useState<{ result?: LayoutResult; error?: string }>({});
  const [run, setRun] = useState(0);
  const { graph, request } = useMemo(() => authoringRequest(controls), [controls]);
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    getLayout({ ...request, signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setState({ result });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({ error: `${error.code ?? "ERROR"}: ${error.message}` });
      },
    );
    return () => controller.abort();
  }, [request, run]);
  const description = descriptions[controls.scenario];
  const scope = request.scope;
  const selectedNodes = scope?.mode === "partial" ? (scope.nodeIds ?? []) : [];
  const selectedEdges = scope?.mode === "partial" ? (scope.edgeIds ?? []) : [];
  const nodeChanges = state.result?.patches.filter((p) => p.op === "updateNode").length ?? 0;
  const edgeChanges = state.result?.patches.filter((p) => p.op === "updateEdge").length ?? 0;
  return (
    <main className="authoring-story">
      <header>
        <p className="eyebrow">Layout / Authoring</p>
        <h1>{description.title}</h1>
        <p>{description.description}</p>
      </header>
      <form
        className="authoring-controls"
        onSubmit={(e) => {
          e.preventDefault();
          setRun((value) => value + 1);
        }}
      >
        {["routes", "selection", "affected"].includes(controls.scenario) && (
          <label>
            Direction
            <select
              value={controls.direction}
              onChange={(e) =>
                setControls({
                  ...controls,
                  direction: e.target.value as AuthoringControls["direction"],
                })
              }
            >
              {["right", "down", "left", "up"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {["selection", "groups"].includes(controls.scenario) && (
          <label>
            Spacing
            <input
              aria-label="Spacing"
              type="range"
              min="0"
              max="80"
              value={controls.spacing}
              onChange={(e) => setControls({ ...controls, spacing: Number(e.target.value) })}
            />
            <output>{controls.spacing}px</output>
          </label>
        )}
        {["routes", "selection", "overlap"].includes(controls.scenario) && (
          <label>
            Blocker X
            <input
              aria-label="Blocker X"
              type="range"
              min="140"
              max="380"
              value={controls.obstacleX}
              onChange={(e) => setControls({ ...controls, obstacleX: Number(e.target.value) })}
            />
            <output>{controls.obstacleX}px</output>
          </label>
        )}
        {["affected", "selection"].includes(controls.scenario) && (
          <label>
            Routing
            <select
              value={controls.routing}
              onChange={(e) =>
                setControls({
                  ...controls,
                  routing: e.target.value as AuthoringControls["routing"],
                })
              }
            >
              <option value="affected">affected</option>
              <option value="selected">selected</option>
            </select>
          </label>
        )}
        {controls.scenario === "groups" && (
          <>
            <label className="group-a-control">
              Group A
              <input
                value={controls.groupA}
                onChange={(e) => setControls({ ...controls, groupA: e.target.value })}
              />
            </label>
            <label className="group-b-control">
              Group B
              <input
                value={controls.groupB}
                onChange={(e) => setControls({ ...controls, groupB: e.target.value })}
              />
            </label>
          </>
        )}
        <button type="submit">Run layout</button>
        <button
          type="button"
          onClick={() => {
            setControls(initial);
            setRun((value) => value + 1);
          }}
        >
          Reset
        </button>
      </form>
      <p className="authoring-limitation">{description.limitation}</p>
      <div className="authoring-comparison">
        <figure>
          <figcaption>Before</figcaption>
          <Diagram
            graph={graph}
            selectedNodes={selectedNodes}
            selectedEdges={selectedEdges}
            groupA={controls.groupA}
            groupB={controls.groupB}
            label="Before layout"
          />
        </figure>
        <figure>
          <figcaption>After</figcaption>
          {state.error ? (
            <div role="alert" className="authoring-error">
              {state.error}
            </div>
          ) : state.result ? (
            <Diagram
              graph={state.result.graph}
              selectedNodes={selectedNodes}
              selectedEdges={selectedEdges}
              groupA={controls.groupA}
              groupB={controls.groupB}
              label="After layout"
            />
          ) : (
            <p role="status">Running layout…</p>
          )}
        </figure>
      </div>
      <p role="status" className="authoring-status">
        {state.result
          ? `${nodeChanges} node patches · ${edgeChanges} edge patches · ${state.result.diagnostics.length} diagnostics`
          : state.error
            ? "Request rejected; input preserved."
            : "Computing…"}
      </p>
      {state.result?.diagnostics.length ? (
        <ul className="authoring-diagnostics" aria-label="Diagnostics">
          {state.result.diagnostics.map((d, i) => (
            <li key={`${d.code}-${i}`}>
              <strong>{d.code}</strong> {d.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="authoring-details">
        <details>
          <summary>Request and constraint groups</summary>
          <pre>{JSON.stringify({ ...request, graph: undefined }, null, 2)}</pre>
        </details>
        <details>
          <summary>Geometry patches</summary>
          <pre>{JSON.stringify(state.result?.patches ?? [], null, 2)}</pre>
        </details>
      </div>
    </main>
  );
}
