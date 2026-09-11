import { writeFile } from "node:fs/promises";
import { layoutStatechart, type ElkNode } from "../src/elkjs";
import fixture from "../test/fixtures/babyfood-statechart.json";

const result = await layoutStatechart(fixture, {
  scopes: {
    babyfood: { initialNodeId: "babyfood.waiting", direction: "RIGHT" },
    "babyfood.intro": { initialNodeId: "babyfood.intro.smallAmount", direction: "DOWN" },
    "babyfood.monitoring": { initialNodeId: "babyfood.monitoring.normal", direction: "DOWN" },
  },
});
const baseline = (
  await layoutStatechart(fixture, {
    scopes: {
      babyfood: { direction: "RIGHT" },
      "babyfood.intro": { direction: "DOWN" },
      "babyfood.monitoring": { direction: "DOWN" },
    },
    maxAttempts: 1,
  })
).graph;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
function svg(graph: ElkNode) {
  const nodes: string[] = [],
    edges: string[] = [],
    labels: string[] = [];
  function visit(node: ElkNode, x: number, y: number) {
    for (const child of node.children ?? []) {
      const cx = x + child.x!,
        cy = y + child.y!;
      nodes.push(
        `<rect x="${cx}" y="${cy}" width="${child.width}" height="${child.height}" rx="5" fill="${child.children?.length ? "#192234" : "#29374c"}" stroke="#687992"/><text x="${cx + 10}" y="${cy + 24}" fill="#fff">${escape(String(child.id).split(".").at(-1)!)}</text>`,
      );
      visit(child, cx, cy);
    }
    for (const edge of node.edges ?? []) {
      for (const section of edge.sections ?? []) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        edges.push(
          `<path d="${points.map((p, i) => `${i ? "L" : "M"}${x + p.x} ${y + p.y}`).join(" ")}" fill="none" stroke="#98abc8" stroke-width="1.5" marker-end="url(#arrow)"/>`,
        );
      }
      for (const label of edge.labels ?? [])
        labels.push(
          `<rect x="${x + label.x!}" y="${y + label.y!}" width="${label.width}" height="${label.height}" rx="4" fill="#101824" stroke="#60738e"/><text x="${x + label.x! + 5}" y="${y + label.y! + label.height! / 2 + 4}" fill="#f4f7fc" font-size="12">${escape((label.text ?? "").replace(/^xstate\.after\.(\d+)\..*$/, "after $1 ms"))}</text>`,
        );
    }
  }
  visit(graph, 0, 0);
  return `<svg viewBox="0 0 ${graph.width} ${graph.height}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#98abc8"/></marker></defs>${nodes.join("")}${edges.join("")}${labels.join("")}</svg>`;
}
const output = process.argv[2] ?? "/tmp/statechart-policy.html";
await writeFile(
  output,
  `<!doctype html><meta charset="utf-8"><title>Statechart policy comparison</title><style>body{background:#101824;color:#f4f7fc;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}svg{width:100%;background:#111c2c}pre{white-space:pre-wrap;font-size:12px}</style><h1>Babyfood: initial-anchored layout</h1><p>Library geometry only. Measured node/edge sizes from supplied fixture; no Viz renderer or geometry repairs.</p><main><section><h2>Baseline</h2>${svg(baseline)}</section><section><h2>Selected policy</h2>${svg(result.graph)}</section></main><pre>${escape(JSON.stringify({ selected: result.attempt, attempts: result.attempts }, null, 2))}</pre>`,
);
console.log(
  JSON.stringify({ output, selected: result.attempt, attempts: result.attempts }, null, 2),
);
