import { javascript } from "@codemirror/lang-javascript";
import { type Diagnostic, lintGutter, linter } from "@codemirror/lint";
import { createGraph } from "@statelyai/graph";
import { basicSetup, EditorView } from "codemirror";
import corpus from "../generated/corpus.json";
import { getLayeredLayout } from "../../src/layered";
import {
  renderGeometry,
  routeLength,
  visibleNodeCount,
  type GeometryGraph,
  type GeometryOptions,
  type GeometrySelection,
  type GeometryViewport,
} from "./geometry-renderer";
import { formatXGraph, parseXGraph, parseXGraphDocument } from "./xgraph-editor";
import "./styles.css";

type CorpusEntry = (typeof corpus)[number];

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing demo element: ${selector}`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(title: string, message: string, state: "ready" | "waiting" | "error"): void {
  status.textContent = title;
  detail.textContent = message;
  delete dot.dataset.ready;
  delete dot.dataset.error;
  if (state === "ready") dot.dataset.ready = "true";
  if (state === "error") dot.dataset.error = "true";
}

function inspectorRow(list: HTMLDListElement, term: string, value: string): void {
  const label = document.createElement("dt");
  label.textContent = term;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(label, detail);
}

function showSelection(selection: GeometrySelection): void {
  const heading = document.createElement("strong");
  const kind = document.createElement("span");
  const values = document.createElement("dl");
  if (selection.kind === "graph") {
    heading.textContent = "Layout extent";
    kind.textContent = "Graph geometry";
    inspectorRow(values, "Origin", `${selection.bounds.x}, ${selection.bounds.y}`);
    inspectorRow(values, "Size", `${selection.bounds.width} × ${selection.bounds.height}`);
    inspectorRow(values, "Nodes", String(visibleNodeCount(selection.graph)));
    inspectorRow(values, "Edges", String(selection.graph.edges.length));
    inspectorRow(
      values,
      "Ports",
      String(selection.graph.nodes.reduce((total, node) => total + (node.ports?.length ?? 0), 0)),
    );
  } else if (selection.kind === "node") {
    heading.textContent = selection.node.label ?? selection.node.id;
    kind.textContent = `Node · ${selection.node.id}`;
    inspectorRow(values, "Position", `${selection.x}, ${selection.y}`);
    inspectorRow(values, "Size", `${selection.node.width} × ${selection.node.height}`);
    inspectorRow(values, "Parent", selection.node.parentId ?? "none");
    inspectorRow(values, "Ports", String(selection.node.ports?.length ?? 0));
  } else if (selection.kind === "port") {
    heading.textContent = selection.port.label ?? selection.port.name;
    kind.textContent = `Port · ${selection.node.id}.${selection.port.name}`;
    inspectorRow(values, "Direction", selection.port.direction);
    inspectorRow(values, "Absolute", `${selection.x}, ${selection.y}`);
    inspectorRow(values, "Node-relative", `${selection.port.x}, ${selection.port.y}`);
    inspectorRow(values, "Size", `${selection.port.width} × ${selection.port.height}`);
  } else {
    const points = selection.edge.points ?? [];
    heading.textContent = selection.edge.id;
    kind.textContent = `Edge · ${selection.edge.sourceId} → ${selection.edge.targetId}`;
    inspectorRow(values, "Routing", selection.edge.routing ?? "polyline");
    inspectorRow(values, "Route points", String(points.length));
    inspectorRow(values, "Route length", routeLength(points).toFixed(1));
  }
  inspector.replaceChildren(heading, kind, values);
}

function diagnosticFor(source: string): Diagnostic[] {
  try {
    parseXGraph(source);
    return [];
  } catch (error) {
    const message = errorMessage(error);
    const match = /at (\d+):(\d+)/.exec(message);
    if (!match) return [{ from: 0, to: Math.min(1, source.length), severity: "error", message }];
    const line = Number(match[1]);
    const column = Number(match[2]);
    const lines = source.split("\n");
    const from =
      lines.slice(0, line - 1).reduce((total, value) => total + value.length + 1, 0) + column - 1;
    return [
      {
        from: Math.max(0, from),
        to: Math.min(source.length, from + 1),
        severity: "error",
        message,
      },
    ];
  }
}

const params = new URLSearchParams(window.location.search);
const initialId = params.get("graph") ?? corpus[0]?.id;
let currentEntry = corpus.find((entry) => entry.id === initialId) ?? corpus[0];
if (!currentEntry) throw new Error("The layout corpus is empty");

const status = element<HTMLElement>("[data-status]");
const detail = element<HTMLElement>("[data-detail]");
const dot = element<HTMLElement>("[data-status-dot]");
const name = element<HTMLElement>("[data-name]");
const summary = element<HTMLElement>("[data-graph-summary]");
const editorMount = element<HTMLElement>("[data-editor]");
const editorState = element<HTMLElement>("[data-editor-state]");
const editorMessage = element<HTMLElement>("[data-editor-message]");
const exampleSelect = element<HTMLSelectElement>("[data-example]");
const geometryMount = element<HTMLElement>("[data-geometry]");
const inspector = element<HTMLElement>("[data-inspector]");
const zoomButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-zoom]")];
const optionInputs = [...document.querySelectorAll<HTMLInputElement>("[data-option]")];

const geometryOptions: GeometryOptions = {
  grid: false,
  bounds: false,
  labels: false,
  points: false,
  ports: true,
};
let currentGraph = currentEntry.graph as unknown as GeometryGraph;
let viewport: GeometryViewport | undefined;
let renderTimer: number | undefined;

const groups = new Map<string, CorpusEntry[]>();
for (const entry of corpus) {
  const category = entry.category.join(" › ");
  const entries = groups.get(category) ?? [];
  entries.push(entry);
  groups.set(category, entries);
}
for (const [category, entries] of groups) {
  const group = document.createElement("optgroup");
  group.label = category;
  for (const entry of entries) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    group.append(option);
  }
  exampleSelect.append(group);
}
exampleSelect.value = currentEntry.id;

function showGraph(graph: GeometryGraph): void {
  currentGraph = graph;
  viewport = renderGeometry(geometryMount, graph, geometryOptions, showSelection);
  const nodeCount = visibleNodeCount(graph);
  summary.textContent = `${nodeCount} nodes · ${graph.edges.length} edges`;
  name.textContent =
    typeof (graph as unknown as { id?: unknown }).id === "string"
      ? String((graph as unknown as { id: string }).id)
      : currentEntry.name;
}

function applySource(source: string): void {
  try {
    const document = parseXGraphDocument(source);
    const graph = document.needsLayout
      ? (getLayeredLayout(createGraph(document.graph), {
          direction: document.graph.direction ?? "right",
          padding: 24,
          spacing: { node: 32, layer: 64 },
        }) as GeometryGraph)
      : document.graph;
    showGraph(graph);
    editorState.textContent = "Valid";
    editorState.dataset.error = "false";
    editorMessage.textContent = document.needsLayout
      ? "Preview updated with native layered layout."
      : "Preview updated from the editor geometry.";
    setStatus(
      "Graph ready",
      `${visibleNodeCount(graph)} nodes · ${graph.edges.length} edges`,
      "ready",
    );
  } catch (error) {
    const message = errorMessage(error);
    editorState.textContent = "Invalid";
    editorState.dataset.error = "true";
    editorMessage.textContent = message;
    setStatus("Invalid XGraph", "Showing the last valid graph", "error");
  }
}

const editor = new EditorView({
  parent: editorMount,
  doc: `${JSON.stringify(currentEntry.graph, null, 2)}\n`,
  extensions: [
    basicSetup,
    javascript(),
    lintGutter(),
    linter((view) => diagnosticFor(view.state.doc.toString()), { delay: 200 }),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      window.clearTimeout(renderTimer);
      editorState.textContent = "Editing…";
      delete editorState.dataset.error;
      setStatus("Editing XGraph", "Waiting for valid JSON5", "waiting");
      renderTimer = window.setTimeout(() => applySource(update.state.doc.toString()), 220);
    }),
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": { fontFamily: '"SFMono-Regular", Consolas, monospace' },
    }),
  ],
});

function replaceEditor(source: string): void {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
}

exampleSelect.addEventListener("change", () => {
  const entry = corpus.find((candidate) => candidate.id === exampleSelect.value);
  if (!entry) return;
  currentEntry = entry;
  replaceEditor(`${JSON.stringify(entry.graph, null, 2)}\n`);
  const url = new URL(window.location.href);
  url.searchParams.set("graph", entry.id);
  history.replaceState(null, "", url);
});

element<HTMLButtonElement>("[data-format]").addEventListener("click", () => {
  try {
    replaceEditor(formatXGraph(editor.state.doc.toString()));
  } catch {
    applySource(editor.state.doc.toString());
  }
});

element<HTMLButtonElement>("[data-copy]").addEventListener("click", async () => {
  await navigator.clipboard.writeText(editor.state.doc.toString());
  editorMessage.textContent = "Copied XGraph to clipboard.";
});

for (const button of zoomButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.zoom === "in") viewport?.zoomIn();
    else if (button.dataset.zoom === "out") viewport?.zoomOut();
    else viewport?.fit();
  });
}

for (const input of optionInputs) {
  input.addEventListener("change", () => {
    geometryOptions[input.dataset.option as keyof GeometryOptions] = input.checked;
    showGraph(currentGraph);
  });
}

showGraph(currentGraph);
setStatus(
  "Graph ready",
  `${visibleNodeCount(currentGraph)} nodes · ${currentGraph.edges.length} edges`,
  "ready",
);
