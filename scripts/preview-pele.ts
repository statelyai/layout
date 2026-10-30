import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { VisualGraph } from "@statelyai/graph";
import { getLayeredLayout, getLayoutRoutes, getPeleLayout, toSvgPath } from "../src";
import { requestGraph } from "../test/fixtures/pele-request";

const output = resolve(process.argv[2] ?? ".scratch/pele-preview");
await mkdir(output, { recursive: true });
const escape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
function svg(graph: VisualGraph, detailed: boolean): string {
  const width = Math.max(...[...graph.nodes, ...graph.edges].map((n) => n.x + n.width)) + 30;
  const height = Math.max(...[...graph.nodes, ...graph.edges].map((n) => n.y + n.height)) + 30;
  const routes = [...getLayoutRoutes(graph).values()]
    .flatMap((route) =>
      route.sections.map(
        (section, index) =>
          `<path d="${toSvgPath(section.path)}" fill="none" stroke="#c8c7be" stroke-width="1.4" ${index === route.sections.length - 1 ? 'marker-end="url(#arrow)"' : ""}/>`,
      ),
    )
    .join("");
  const boxes = (nodes: typeof graph.nodes | typeof graph.edges, edges: boolean) =>
    nodes
      .map((n) => {
        if (n.width === 0 || n.height === 0) return "";
        if (!edges && n.id === "initial")
          return `<circle cx="${n.x + n.width / 2}" cy="${n.y + n.height / 2}" r="${n.width / 2}" fill="#c8c7be"/>`;
        if (edges && !detailed)
          return `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="#1c1c1a"/><text x="${n.x + n.width / 2}" y="${n.y + n.height / 2}" dy=".35em" text-anchor="middle" fill="#deddd4" font-family="Arial" font-size="14">${escape(n.label ?? "")}</text>`;
        const description: string | undefined = detailed ? n.data.description : undefined;
        return `<g><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${edges ? 12 : 9}" fill="${edges ? "#1c1c1a" : "#282826"}" stroke="#464640" ${edges && detailed && /IF|ELSE/.test(n.label ?? "") ? 'stroke-dasharray="5 4"' : ""}/><foreignObject x="${n.x + 12}" y="${n.y + 5}" width="${n.width - 24}" height="${n.height - 10}"><div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;display:flex;flex-direction:column;justify-content:center;color:#deddd4;font-family:Arial,sans-serif;font-size:${detailed ? 14 : 16}px;text-align:${detailed ? "left" : "center"};line-height:1.3"><div style="font-weight:${detailed ? 600 : 400}">${escape(n.label ?? "")}</div>${description ? `<div style="font-size:12px;color:#b9b8af;margin-top:5px">${escape(description)}</div>` : ""}</div></foreignObject></g>`;
      })
      .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7Z" fill="#c8c7be"/></marker></defs><rect width="100%" height="100%" fill="#1c1c1a"/>${routes}${boxes(graph.nodes, false)}${boxes(graph.edges, true)}</svg>`;
}
for (const detailed of [false, true]) {
  const input = requestGraph(detailed);
  if (!detailed) {
    const widths = [96, 168, 172, 152, 230, 210, 92];
    for (const [i, node] of input.nodes.entries()) {
      node.width = widths[i]!;
      node.height = i === 5 ? 66 : 48;
    }
    for (const edge of input.edges) edge.width = (edge.label?.length ?? 0) * 7 + 12;
  }
  input.nodes.push({
    type: "node",
    id: "initial",
    label: "",
    width: 14,
    height: 14,
    shape: "circle",
    data: { description: "" },
  });
  input.edges.push({
    type: "edge",
    id: "initial-queued",
    sourceId: "initial",
    targetId: "Queued",
    label: "",
    width: 0,
    height: 0,
    data: { guard: "", description: "" },
  });
  if (!detailed)
    for (const edge of input.edges)
      if (/IF|ELSE/.test(edge.label ?? "")) {
        edge.label = "";
        edge.width = 0;
        edge.height = 0;
      }
  if (detailed) {
    for (const node of input.nodes) if (node.id !== "initial") node.height = 132;
    for (const edge of input.edges) if (edge.id !== "initial-queued") edge.height = 98;
  }
  const pele = getPeleLayout(input);
  const layered = getLayeredLayout(input, {
    direction: "down",
    spacing: { node: 40, layer: 44 },
  });
  const name = detailed ? "descriptions-and-guards" : "compact";
  await writeFile(
    resolve(output, `${name}.json`),
    JSON.stringify(
      pele,
      (_, value) => (value instanceof Map ? Object.fromEntries(value) : value),
      2,
    ),
  );
  await writeFile(resolve(output, `${name}.svg`), svg(pele, detailed));
  await writeFile(
    resolve(output, `${name}.html`),
    `<!doctype html><html><head><meta charset="utf-8"><title>Pele layout ${name}</title><style>body{margin:0;padding:24px;background:#1c1c1a;color:#deddd4;font:16px Arial}h1{font-size:22px;margin:0 0 8px}p{color:#aaa;margin:0 0 20px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:30px}.panel{min-width:0}h2{font-size:17px}svg{display:block;width:100%;height:auto}</style></head><body><h1>Same graph, independent layout engines</h1><p>${detailed ? "Descriptions and guards retained with explicit box dimensions." : "Compact state labels, matching the supplied Mermaid topology."} Library output, not editor integration.</p><div class="panels"><div class="panel"><h2>Existing native layered</h2>${svg(layered, detailed)}</div><div class="panel"><h2>Pele</h2>${svg(pele, detailed)}</div></div></body></html>`,
  );
}
console.log(output);
