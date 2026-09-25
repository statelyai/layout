import { useEffect, useId, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createGraph, type VisualGraph } from "@statelyai/graph";
import { getLayout, type LayoutDirection, type LayoutResult } from "../src";

const input = createGraph({
  nodes: ["Start", "Validate", "Review", "Approve", "Publish", "Notify", "Archive", "Done"].map(
    (id) => ({ id, width: 100, height: 48 }),
  ),
  edges: [
    ["Start", "Validate"],
    ["Validate", "Review"],
    ["Review", "Approve"],
    ["Approve", "Publish"],
    ["Publish", "Done"],
    ["Start", "Notify"],
    ["Notify", "Archive"],
    ["Archive", "Done"],
  ].map(([sourceId, targetId]) => ({
    id: `${sourceId}-${targetId}`,
    sourceId: sourceId!,
    targetId: targetId!,
  })),
});

function PartialSelection() {
  const [initial, setInitial] = useState<VisualGraph>();
  const [graph, setGraph] = useState<VisualGraph>();
  const [before, setBefore] = useState<VisualGraph>();
  const [selected, setSelected] = useState<string[]>([]);
  const [direction, setDirection] = useState<LayoutDirection>("down");
  const [result, setResult] = useState<LayoutResult>();
  const [message, setMessage] = useState("Laying out the whole graph…");
  const [busy, setBusy] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const arrow = useId();
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    getLayout({ graph: input, options: { direction: "right" }, signal: abort.signal }).then(
      (layout) => {
        if (abort.signal.aborted) return;
        setInitial(layout.graph);
        setGraph(layout.graph);
        setBusy(false);
        setMessage("Whole graph laid out. Click nodes to select a subset.");
      },
      (error) => {
        if (!abort.signal.aborted) {
          setMessage(String(error));
          setBusy(false);
        }
      },
    );
    return () => controller.current?.abort();
  }, []);
  const toggle = (id: string) => {
    if (!busy)
      setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  };
  async function arrange() {
    if (!graph || !selected.length || busy) return;
    const previous = graph;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    try {
      const next = await getLayout({
        graph: previous,
        scope: { mode: "partial", nodeIds: selected, routing: "affected" },
        options: { direction },
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      const fixed = previous.nodes.filter((node) => !selected.includes(node.id));
      const unchanged = fixed.every((node) => {
        const after = next.graph.nodes.find((candidate) => candidate.id === node.id)!;
        return (
          node.x === after.x &&
          node.y === after.y &&
          node.width === after.width &&
          node.height === after.height
        );
      });
      const moved = next.graph.nodes.filter((node) => {
        const old = previous.nodes.find((candidate) => candidate.id === node.id)!;
        return old.x !== node.x || old.y !== node.y;
      }).length;
      setBefore(previous);
      setGraph(next.graph);
      setResult(next);
      setMessage(
        `${moved} selected nodes moved. ${fixed.length} unselected nodes ${unchanged ? "unchanged" : "changed unexpectedly"}.`,
      );
    } catch (error) {
      if (!abort.signal.aborted) setMessage(String(error));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  // Keep one camera across edits so fixed nodes visibly stay fixed. Scroll for distant placements.
  const width = initial ? Math.max(...initial.nodes.map((n) => n.x + n.width)) + 100 : 1000;
  const height = initial
    ? Math.max(600, Math.max(...initial.nodes.map((n) => n.y + n.height)) + 300)
    : 600;
  const canvasWidth = Math.max(width, ...(graph?.nodes ?? []).map((n) => n.x + n.width + 60));
  const canvasHeight = Math.max(height, ...(graph?.nodes ?? []).map((n) => n.y + n.height + 60));
  return (
    <main className="authoring-story">
      <header>
        <p className="eyebrow">Layout / Interactive selection</p>
        <h1>Auto-layout part of a graph</h1>
        <p>
          Click any nodes to toggle selection, choose a direction, then auto-layout the selection.
          Blue nodes may move; all other nodes stay fixed. Connected edges are repaired.
        </p>
      </header>
      <div className="authoring-controls">
        <button
          disabled={busy}
          onClick={() => setSelected(["Validate", "Review", "Approve", "Publish"])}
        >
          Select review branch
        </button>
        <button disabled={busy || !selected.length} onClick={() => setSelected([])}>
          Clear selection
        </button>
        <label>
          Selection direction
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as LayoutDirection)}
          >
            {["down", "right", "up", "left"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button className="selection-primary" disabled={busy || !selected.length} onClick={arrange}>
          Auto-layout selection ({selected.length})
        </button>
        <button
          disabled={busy || !initial}
          onClick={() => {
            setGraph(initial);
            setBefore(undefined);
            setResult(undefined);
            setSelected([]);
            setMessage("Reset to the original full layout.");
          }}
        >
          Reset graph
        </button>
      </div>
      <p role="status">{busy ? "Computing layout…" : message}</p>
      <figure>
        <figcaption>
          Click to select · Blue = selected · Dashed outlines = previous positions
        </figcaption>
        <div className="selection-canvas">
          <svg
            width={canvasWidth}
            height={canvasHeight}
            aria-label="Selectable laid-out graph"
            role="group"
          >
            <defs>
              <marker
                id={arrow}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10" fill="#7b899d" />
              </marker>
            </defs>
            {before?.nodes.map((node) => (
              <rect
                key={node.id}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="6"
                fill="none"
                stroke="#9aa8bb"
                strokeDasharray="5 4"
              />
            ))}
            {graph?.edges.map((edge) => (
              <polyline
                key={edge.id}
                data-edge-id={edge.id}
                points={edge.points?.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#7b899d"
                strokeWidth="1.5"
                markerEnd={`url(#${arrow})`}
              />
            ))}
            {graph?.nodes.map((node) => (
              <g
                key={node.id}
                data-node-id={node.id}
                transform={`translate(${node.x},${node.y})`}
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-label={`Select ${node.id}`}
                aria-pressed={selected.includes(node.id)}
                aria-disabled={busy}
                className={selected.includes(node.id) ? "selected-node" : "fixed-node"}
                onClick={() => toggle(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(node.id);
                  }
                }}
              >
                <rect width={node.width} height={node.height} rx="6" />
                <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">
                  {node.id}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </figure>
      {result?.diagnostics.length ? (
        <ul aria-label="Diagnostics" className="authoring-diagnostics">
          {result.diagnostics.map((d, i) => (
            <li key={i}>
              <strong>{d.code}</strong> {d.message}
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary>Partial layout request</summary>
        <pre>
          {JSON.stringify(
            {
              scope: { mode: "partial", nodeIds: selected, routing: "affected" },
              options: { direction },
            },
            null,
            2,
          )}
        </pre>
      </details>
      <p className="authoring-limitation">
        Partial routing currently uses the custom orthogonal router. Route quality remains a
        separate limitation.
      </p>
    </main>
  );
}

const meta = { title: "Layout/Partial selection", component: PartialSelection } satisfies Meta<
  typeof PartialSelection
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SelectAndAutoLayout: Story = {};
