import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { createGraph, type VisualGraph } from "@statelyai/graph";
import { c, getFixedLayout, getLayout, type LayoutRequest } from "../src";

const output = new URL("../docs/proofs/partial-authoring/", import.meta.url);
await mkdir(output, { recursive: true });
const graph = getFixedLayout(
  createGraph({
    nodes: [
      { id: "a", x: 30, y: 90, width: 70, height: 40 },
      { id: "b", x: 350, y: 90, width: 70, height: 40 },
      { id: "blocker", x: 170, y: 60, width: 100, height: 100 },
    ],
    edges: [
      {
        id: "ab",
        sourceId: "a",
        targetId: "b",
        x: 110,
        y: 200,
        width: 70,
        height: 24,
        points: [
          { x: 100, y: 110 },
          { x: 350, y: 110 },
        ],
        routing: "orthogonal",
      },
    ],
  }),
  { direction: "right" },
);
const labels = getFixedLayout(
  createGraph({
    nodes: [
      { id: "a", x: 20, y: 90, width: 70, height: 40 },
      { id: "b", x: 380, y: 90, width: 70, height: 40 },
    ],
    edges: [
      {
        id: "one",
        sourceId: "a",
        targetId: "b",
        x: 125,
        y: 20,
        width: 70,
        height: 24,
        points: [
          { x: 90, y: 110 },
          { x: 110, y: 110 },
          { x: 110, y: 10 },
          { x: 370, y: 10 },
          { x: 370, y: 110 },
          { x: 380, y: 110 },
        ],
      },
      {
        id: "two",
        sourceId: "a",
        targetId: "b",
        x: 235,
        y: 100,
        width: 70,
        height: 24,
        points: [
          { x: 90, y: 110 },
          { x: 380, y: 110 },
        ],
      },
      {
        id: "three",
        sourceId: "a",
        targetId: "b",
        x: 145,
        y: 210,
        width: 70,
        height: 24,
        points: [
          { x: 90, y: 110 },
          { x: 110, y: 110 },
          { x: 110, y: 245 },
          { x: 370, y: 245 },
          { x: 370, y: 110 },
          { x: 380, y: 110 },
        ],
      },
    ],
  }),
  { direction: "right" },
);
const selection = getFixedLayout(
  createGraph({
    nodes: [
      { id: "a", x: 35, y: 40, width: 70, height: 40 },
      { id: "b", x: 40, y: 200, width: 70, height: 40 },
      { id: "fixed", x: 270, y: 140, width: 130, height: 80 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", width: 0, height: 0 }],
  }),
  { direction: "right" },
);
const cases: {
  title: string;
  detail: string;
  graph: VisualGraph;
  request: Omit<LayoutRequest, "graph">;
}[] = [
  {
    title: "Edge-only routing",
    detail: "Nodes and label fixed; route avoids the blocker.",
    graph,
    request: { scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" } },
  },
  {
    title: "Align and distribute labels",
    detail: "Routes and endpoints fixed; label centers and gaps constrained.",
    graph: labels,
    request: {
      scope: { mode: "partial", edgeIds: ["one", "two", "three"], edgeGeometry: "labels" },
      constraints: [
        c.align({
          id: "centers",
          entities: ["one", "two", "three"].map((edgeId) => ({ edgeId, part: "label" as const })),
          axis: "x",
        }),
        c.distribute({
          id: "gaps",
          entities: ["one", "two", "three"].map((edgeId) => ({ edgeId, part: "label" as const })),
          axis: "y",
          gap: 60,
        }),
      ],
    },
  },
  {
    title: "Arrange selected nodes",
    detail: "Only a and b selected; the surrounding fixed node stays put.",
    graph: selection,
    request: { scope: { mode: "partial", nodeIds: ["a", "b"] } },
  },
];
function svg(g: VisualGraph) {
  return `<svg viewBox="0 0 480 270" aria-label="Graph geometry">${g.edges.map((e) => `<polyline points="${(e.points ?? []).map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#b45c0b" stroke-width="2"/>`).join("")}${g.nodes.map((n) => `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="5" fill="#eff6ff" stroke="#245b9a"/><text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + 4}" text-anchor="middle">${n.id}</text>`).join("")}${g.edges
    .filter((e) => e.width > 0)
    .map(
      (e) =>
        `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="4" fill="#fff4db" stroke="#b45c0b"/><text x="${e.x + e.width / 2}" y="${e.y + e.height / 2 + 4}" text-anchor="middle">${e.id}</text>`,
    )
    .join("")}</svg>`;
}
const results = await Promise.all(
  cases.map(async (item) => ({
    ...item,
    result: await getLayout({ graph: item.graph, ...item.request }),
  })),
);
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Partial layout proof</title><style>body{font:14px system-ui;margin:32px;background:#f7f8fa;color:#182334}main{max-width:1040px;margin:auto}h1{font-size:26px}h2{font-size:18px;margin:16px 0 3px}p{margin:5px 0 12px;color:#526174}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;background:white;border:1px solid #dce1e9;border-radius:8px;overflow:hidden}figcaption{padding:8px 14px;background:#edf0f5;font-weight:600}svg{display:block;width:100%}svg text{font:12px system-ui}</style></head><body><main><h1>Partial layout authoring</h1><p>Matched before/after: same input, direction, viewport, and scale. Before shows authored geometry.</p>${results.map((item) => `<section><h2>${item.title}</h2><p>${item.detail}</p><div class="pair"><figure><figcaption>Before</figcaption>${svg(item.graph)}</figure><figure><figcaption>After</figcaption>${svg(item.result.graph)}</figure></div></section>`).join("")}</main></body></html>`;
await writeFile(new URL("proof.html", output), html);
await writeFile(
  new URL("geometry.json", output),
  JSON.stringify(
    results.map(({ title, graph, request, result }) => ({
      title,
      before: graph,
      request,
      after: result.graph,
      patches: result.patches,
      diagnostics: result.diagnostics,
    })),
    null,
    2,
  ) + "\n",
);
execFileSync(
  "pnpm",
  [
    "exec",
    "oxfmt",
    fileURLToPath(new URL("proof.html", output)),
    fileURLToPath(new URL("geometry.json", output)),
  ],
  { stdio: "inherit" },
);
console.log(new URL("proof.html", output).pathname);
