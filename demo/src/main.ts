import { createStatelyEmbed } from "@statelyai/sdk/embed";
import corpus from "../generated/corpus.json";
import "./styles.css";

type CorpusEntry = (typeof corpus)[number];

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing demo element: ${selector}`);
  return value;
}

const params = new URLSearchParams(window.location.search);
const editorBaseUrl = params.get("editor") ?? "http://localhost:3000";
const initialId = params.get("graph") ?? corpus[0]?.id;
const initial = corpus.find((entry) => entry.id === initialId) ?? corpus[0];
if (!initial) throw new Error("The layout corpus is empty");

const select = element<HTMLSelectElement>("[data-scenario]");
const status = element<HTMLElement>("[data-status]");
const detail = element<HTMLElement>("[data-detail]");
const dot = element<HTMLElement>("[data-status-dot]");
const name = element<HTMLElement>("[data-name]");
const description = element<HTMLElement>("[data-description]");
const engine = element<HTMLElement>("[data-engine]");
const mount = element<HTMLElement>("[data-embed]");
element<HTMLElement>("[data-count]").textContent = String(corpus.length);

for (const entry of corpus) {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = entry.name;
  option.selected = entry.id === initial.id;
  select.append(option);
}

function showEntry(entry: CorpusEntry): void {
  name.textContent = entry.name;
  description.textContent = entry.description;
  engine.textContent = entry.engine === "native" ? "Native TypeScript" : "elkjs oracle";
  engine.dataset.engine = entry.engine;
}

showEntry(initial);

const embed = createStatelyEmbed({
  baseUrl: editorBaseUrl,
  apiKey: params.get("api_key") ?? "test",
  machines: corpus.map((entry) => ({ id: entry.id, name: entry.name, machine: entry.graph })),
  currentMachineId: initial.id,
  mode: "viewing",
  theme: "dark",
  readOnly: true,
  depth: 1,
  panels: {
    leftPanels: ["structure"],
    rightPanels: ["graph"],
  },
  onReady() {
    status.textContent = "Project view connected";
    detail.textContent = `${corpus.length} pre-laid graphs loaded through @statelyai/sdk`;
    dot.dataset.ready = "true";
  },
  onLoaded(graph) {
    detail.textContent = `Rendered ${graph.nodes.length - 1} states and ${graph.edges.length} transitions`;
  },
  onError(error) {
    status.textContent = "Project view error";
    detail.textContent = error.message;
    dot.dataset.error = "true";
  },
});

embed.mount(mount);
embed.on("machineSelected", ({ machineId }) => {
  const entry = corpus.find((candidate) => candidate.id === machineId);
  if (!entry) return;
  select.value = entry.id;
  showEntry(entry);
});

select.addEventListener("change", () => {
  const entry = corpus.find((candidate) => candidate.id === select.value);
  if (!entry) return;
  showEntry(entry);
  embed.selectMachine(entry.id);
  const url = new URL(window.location.href);
  url.searchParams.set("graph", entry.id);
  history.replaceState(null, "", url);
});
