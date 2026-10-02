import fs from "node:fs";
const root = "docs/heuristics/compound-baseline";
const report = JSON.parse(fs.readFileSync(`${root}/report.json`, "utf8"));
const escape = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const colors = ["#2563eb", "#9333ea", "#059669", "#d97706", "#db2777"];
function scene(graph) {
  const nodes = [],
    owners = [],
    origins = new Map();
  function visit(node, x, y, isRoot = false) {
    const ax = x + (isRoot ? 0 : (node.x ?? 0)),
      ay = y + (isRoot ? 0 : (node.y ?? 0));
    origins.set(node.id, { x: ax, y: ay });
    if (!isRoot) nodes.push({ ...node, x: ax, y: ay });
    owners.push({ node, x: ax, y: ay });
    for (const child of node.children ?? []) visit(child, ax, ay);
  }
  visit(graph, 0, 0, true);
  const paths = owners.flatMap(({ node, x, y }) =>
    (node.edges ?? []).flatMap((edge, index) => {
      const origin = origins.get(edge.container) ?? { x, y };
      return (edge.sections ?? []).map((section) => ({
        id: edge.id,
        color: colors[index % colors.length],
        points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
          x: p.x + origin.x,
          y: p.y + origin.y,
        })),
      }));
    }),
  );
  const bounds = [
    ...nodes.flatMap((n) => [
      { x: n.x, y: n.y },
      { x: n.x + n.width, y: n.y + n.height },
    ]),
    ...paths.flatMap((p) => p.points),
  ];
  const markup =
    nodes
      .map(
        (n) =>
          `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="${n.children?.length ? "#f1f5f9" : "white"}" stroke="#94a3b8"/><text x="${n.x + 5}" y="${n.y + 13}" font-size="10">${escape(n.id)}</text>`,
      )
      .join("") +
    paths
      .map(
        (p) =>
          `<polyline points="${p.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${p.color}" stroke-width="1.5"><title>${escape(p.id)}</title></polyline>`,
      )
      .join("");
  return { bounds, markup };
}
const entries = report.rows
  .map((row, index) => {
    const a = scene(row.native.graph),
      b = scene(row.elk.graph),
      points = [...a.bounds, ...b.bounds];
    const left = Math.min(0, ...points.map((p) => p.x)) - 20,
      top = Math.min(0, ...points.map((p) => p.y)) - 20;
    const width = Math.max(...points.map((p) => p.x)) - left + 20,
      height = Math.max(...points.map((p) => p.y)) - top + 20;
    const svg = (s) =>
      `<svg viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}" role="img">${s.markup}</svg>`;
    return `<section id="case-${index}" hidden><p>Seed ${row.seed} · ${row.direction} · ${row.differences.length} differing values</p><div class="pair"><article><h2>Native Stately</h2>${svg(a)}</article><article><h2>Real ELK 0.11.1</h2>${svg(b)}</article></div></section>`;
  })
  .join("\n");
const options = report.rows
  .map((r, index) => `<option value="${index}">${r.direction} seed ${r.seed}</option>`)
  .join("");
fs.writeFileSync(
  `${root}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Compound parity baseline</title><style>body{font:14px system-ui;margin:24px;color:#172033}header{position:sticky;top:0;background:white;padding:12px 0}.pair{display:flex;gap:24px;align-items:flex-start}article{border:1px solid #ddd;padding:12px;overflow:auto;flex:1}h2{font-size:14px}svg{display:block;max-width:none}select{font:inherit}</style><header><h1>Compound parity baseline</h1><p>${report.summary.matched}/${report.summary.cases} full matches. Equal viewports and scale per pair; original routes preserved.</p><label>Graph <select id="cases">${options}</select></label> · <a href="report.json">Complete inputs, outputs and differences</a> · <a href="worker-phases.json">Real ELK phases</a></header>${entries}<script>const select=document.querySelector('#cases');function show(){const i=Math.max(0,Math.min(99,Number(location.hash.slice(1))||0));select.value=i;document.querySelectorAll('section').forEach((s,n)=>s.hidden=n!==i)}select.onchange=()=>location.hash=select.value;onhashchange=show;show()</script>`,
);
