import { createStatelyEmbed } from "@statelyai/sdk/embed";
import corpus from "../generated/corpus.json";
import {
  renderGeometry,
  routeLength,
  type GeometryGraph,
  type GeometryOptions,
  type GeometrySelection,
} from "./geometry-renderer";
import "./styles.css";

type CorpusEntry = (typeof corpus)[number];
type View = "geometry" | "sdk";

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing demo element: ${selector}`);
  return value;
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
    inspectorRow(values, "Nodes", String(selection.graph.nodes.length - 1));
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
    inspectorRow(
      values,
      "Ports",
      `${selection.edge.sourcePort ?? "node"} → ${selection.edge.targetPort ?? "node"}`,
    );
    inspectorRow(
      values,
      "Label rect",
      `${selection.edge.x}, ${selection.edge.y} · ${selection.edge.width} × ${selection.edge.height}`,
    );
  }

  inspector.replaceChildren(heading, kind, values);
}

const params = new URLSearchParams(window.location.search);
const editorBaseUrl = params.get("editor") ?? "http://localhost:3000";
const initialId = params.get("graph") ?? corpus[0]?.id;
let currentEntry = corpus.find((entry) => entry.id === initialId) ?? corpus[0];
if (!currentEntry) throw new Error("The layout corpus is empty");

const select = element<HTMLSelectElement>("[data-scenario]");
const status = element<HTMLElement>("[data-status]");
const detail = element<HTMLElement>("[data-detail]");
const dot = element<HTMLElement>("[data-status-dot]");
const name = element<HTMLElement>("[data-name]");
const description = element<HTMLElement>("[data-description]");
const engine = element<HTMLElement>("[data-engine]");
const embedMount = element<HTMLElement>("[data-embed]");
const geometryMount = element<HTMLElement>("[data-geometry]");
const geometryView = element<HTMLElement>("[data-geometry-view]");
const geometryControls = element<HTMLElement>("[data-geometry-controls]");
const inspector = element<HTMLElement>("[data-inspector]");
const viewButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-view]")];
const optionInputs = [...document.querySelectorAll<HTMLInputElement>("[data-option]")];
element<HTMLElement>("[data-count]").textContent = String(corpus.length);

const geometryOptions: GeometryOptions = {
  grid: true,
  bounds: true,
  labels: true,
  points: true,
  ports: true,
};
let currentView: View = params.get("view") === "sdk" ? "sdk" : "geometry";
let embed: ReturnType<typeof createStatelyEmbed> | undefined;

for (const entry of corpus) {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = entry.name;
  option.selected = entry.id === currentEntry.id;
  select.append(option);
}

function showEntry(entry: CorpusEntry): void {
  currentEntry = entry;
  name.textContent = entry.name;
  description.textContent = entry.description;
  engine.textContent = entry.engine === "native" ? "Native TypeScript" : "elkjs oracle";
  engine.dataset.engine = entry.engine;
  renderGeometry(
    geometryMount,
    entry.graph as unknown as GeometryGraph,
    geometryOptions,
    showSelection,
  );
}

function ensureEmbed(): void {
  if (embed) return;
  setStatus("Connecting to project view…", "Waiting for @statelyai/sdk", "waiting");
  embed = createStatelyEmbed({
    baseUrl: editorBaseUrl,
    apiKey: params.get("api_key") ?? "test",
    machines: corpus.map((entry) => ({ id: entry.id, name: entry.name, machine: entry.graph })),
    currentMachineId: currentEntry.id,
    mode: "viewing",
    theme: "dark",
    readOnly: true,
    depth: 1,
    panels: {
      leftPanels: ["structure"],
      rightPanels: ["graph"],
    },
    onReady() {
      if (currentView === "sdk") {
        setStatus(
          "Project view connected",
          `${corpus.length} pre-laid graphs loaded through @statelyai/sdk`,
          "ready",
        );
      }
    },
    onLoaded(graph) {
      if (currentView === "sdk") {
        setStatus(
          "Project view connected",
          `Rendered ${graph.nodes.length - 1} states and ${graph.edges.length} transitions`,
          "ready",
        );
      }
    },
    onError(error) {
      if (currentView === "sdk") setStatus("Project view error", error.message, "error");
    },
  });
  embed.mount(embedMount);
  embed.on("machineSelected", ({ machineId }) => {
    const entry = corpus.find((candidate) => candidate.id === machineId);
    if (!entry) return;
    select.value = entry.id;
    showEntry(entry);
  });
}

function showView(view: View): void {
  currentView = view;
  const geometryVisible = view === "geometry";
  geometryView.hidden = !geometryVisible;
  geometryControls.hidden = !geometryVisible;
  embedMount.hidden = geometryVisible;
  for (const button of viewButtons) {
    const selected = button.dataset.view === view;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  if (geometryVisible) {
    setStatus(
      "Geometry inspector ready",
      "Authoritative routes, bounds, ports, and labels",
      "ready",
    );
  } else {
    ensureEmbed();
    embed?.selectMachine(currentEntry.id);
  }
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  history.replaceState(null, "", url);
}

showEntry(currentEntry);
showView(currentView);

select.addEventListener("change", () => {
  const entry = corpus.find((candidate) => candidate.id === select.value);
  if (!entry) return;
  showEntry(entry);
  embed?.selectMachine(entry.id);
  const url = new URL(window.location.href);
  url.searchParams.set("graph", entry.id);
  history.replaceState(null, "", url);
});

for (const button of viewButtons) {
  button.addEventListener("click", () => showView(button.dataset.view as View));
}

for (const input of optionInputs) {
  input.addEventListener("change", () => {
    const option = input.dataset.option as keyof GeometryOptions;
    geometryOptions[option] = input.checked;
    showEntry(currentEntry);
  });
}
