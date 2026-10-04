// Render preserved geometry directly; no layout, route repair or coordinate fitting per engine.
import fs from "node:fs";
import { resolve } from "node:path";
import { readReport } from "./parity/read-report.mjs";
const [beforePath, afterPath, destination, ...selected] = process.argv.slice(2);
if (!beforePath || !afterPath || !destination)
  throw new Error("Pass before report, after report, output directory and optional row indices");
const before = readReport(beforePath),
  after = readReport(afterPath);
const indices = selected.length ? selected.map(Number) : [68, 69, 76, 81, 90, 91];
const escape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function scene(root) {
  const nodes = [],
    ports = [],
    edges = [],
    junctions = [],
    origins = new Map([[String(root.id), { x: 0, y: 0 }]]),
    containers = [];
  const visit = (graph, x, y) => {
    origins.set(String(graph.id), { x, y });
    containers.push({ graph, x, y });
    for (const node of graph.children ?? []) {
      const nx = x + (node.x ?? 0),
        ny = y + (node.y ?? 0);
      nodes.push({ ...node, x: nx, y: ny });
      for (const port of node.ports ?? [])
        ports.push({
          id: port.id,
          x: nx + (port.x ?? 0) + (port.width ?? 0) / 2,
          y: ny + (port.y ?? 0) + (port.height ?? 0) / 2,
        });
      visit(node, nx, ny);
    }
  };
  visit(root, 0, 0);
  for (const { graph, x, y } of containers)
    for (const edge of graph.edges ?? []) {
      const origin = origins.get(String(edge.container ?? graph.id)) ?? { x, y };
      for (const point of edge.junctionPoints ?? [])
        junctions.push({ id: edge.id, x: point.x + origin.x, y: point.y + origin.y });
      for (const section of edge.sections ?? []) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
          (p) => ({ x: p.x + origin.x, y: p.y + origin.y }),
        );
        edges.push({ id: edge.id, points });
      }
    }
  return { root, nodes, ports, edges, junctions };
}
function svg(scene, box) {
  return `<svg viewBox="${box.join(" ")}" role="img">${scene.nodes.map((n) => `<rect x="${n.x}" y="${n.y}" width="${n.width ?? 0}" height="${n.height ?? 0}" fill="${n.children?.length ? "#f1f5f9" : "white"}" stroke="#94a3b8"/><text x="${n.x + 5}" y="${n.y + 14}" font-size="10">${escape(n.id)}</text>`).join("")}${scene.edges.map((e, i) => `<polyline points="${e.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${["#2563eb", "#9333ea", "#059669", "#ea580c"][i % 4]}" stroke-width="1.5"><title>${escape(e.id)}</title></polyline>`).join("")}${scene.junctions.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#0f172a" stroke="white" stroke-width="1"><title>Junction ${escape(p.id)}</title></circle>`).join("")}${scene.ports.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#0f172a"><title>${escape(p.id)}</title></circle>`).join("")}</svg>`;
}
const rows = indices.map((index) => {
  const old = before.rows[index],
    row = after.rows[index];
  if (!old || !row || JSON.stringify(old.input) !== JSON.stringify(row.input))
    throw new Error(`Missing or changed input at row ${index}`);
  return { index, before: old.native, ...row };
});
let html = `<!doctype html><meta charset="utf-8"><title>Native boundary routing compared with real ELK</title><style>body{font:14px system-ui;margin:24px;color:#172033}header{position:sticky;top:0;background:white;padding:12px 0}.pair{display:flex;gap:24px;align-items:flex-start}article{border:1px solid #ddd;padding:12px;overflow:auto;flex:1;min-width:0}h2{font-size:14px}svg{display:block;width:100%;height:auto}select{font:inherit}</style><header><h1>Native boundary routing compared with real ELK</h1><p>${rows.filter((r) => r.equal).length}/${rows.length} selected full matches. Equal viewports and scale; preserved routes and containers.</p><label>Graph <select id="cases">${rows.map((r, i) => `<option value="${i}">${escape(r.family)} · ${escape(r.direction)} seed ${r.seed}</option>`).join("")}</select></label> · <a href="report.json">Complete inputs, outputs and differences</a></header>`;
for (const [index, row] of rows.entries()) {
  const outputs = [row.before, row.native, row.elk];
  const scenes = outputs.map((o) => (o.graph ? scene(o.graph) : null));
  const points = scenes.flatMap((s) =>
    s
      ? [
          { x: 0, y: 0 },
          { x: s.root.width ?? 0, y: s.root.height ?? 0 },
          ...s.nodes.flatMap((n) => [
            { x: n.x, y: n.y },
            { x: n.x + (n.width ?? 0), y: n.y + (n.height ?? 0) },
          ]),
          ...s.ports,
          ...s.junctions,
          ...s.edges.flatMap((e) => e.points),
        ]
      : [],
  );
  const x = Math.min(0, ...points.map((p) => p.x)) - 20,
    y = Math.min(0, ...points.map((p) => p.y)) - 20;
  const box = [
    x,
    y,
    Math.max(...points.map((p) => p.x)) - x + 20,
    Math.max(...points.map((p) => p.y)) - y + 20,
  ];
  html += `<section id="case-${index}" hidden><p>Row ${row.index} · ${escape(row.direction)} · ${row.differences.length} differing values</p><div class="pair">${scenes.map((s, i) => `<article><h2>${["Native before", "Native after", "Real ELK 0.11.1"][i]}</h2><p>${s?.junctions.length ?? 0} junction points</p>${s ? svg(s, box) : `<p>${escape(outputs[i].error)}</p>`}</article>`).join("")}</div></section>`;
}
html += `<script>const select=document.querySelector('#cases');function show(){const i=Math.max(0,Math.min(select.options.length-1,Number(location.hash.slice(1))||0));select.value=i;document.querySelectorAll('section').forEach((s,n)=>s.hidden=n!==i)}select.onchange=()=>location.hash=select.value;onhashchange=show;show()</script>`;
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(resolve(destination, "index.html"), html);
fs.writeFileSync(resolve(destination, "report.json"), JSON.stringify({ rows }, null, 2) + "\n");
console.log({ destination, cases: rows.length, matched: rows.filter((r) => r.equal).length });
