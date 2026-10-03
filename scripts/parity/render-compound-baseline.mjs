import fs from "node:fs";
const root = process.argv[2] ?? "docs/heuristics/compound-baseline";
const report = JSON.parse(fs.readFileSync(`${root}/report.json`, "utf8"));
const before = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], "utf8")) : undefined;
if (
  before &&
  JSON.stringify(before.rows.map((row) => row.input)) !==
    JSON.stringify(report.rows.map((row) => row.input))
) {
  throw new Error("Before/after inputs differ");
}
const escape = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const title = escape(process.argv[4] ?? "Compound parity baseline");
const colors = ["#2563eb", "#9333ea", "#059669", "#d97706", "#db2777"];
function scene(graph, error) {
  if (!graph)
    return {
      bounds: [],
      markup: `<text x="0" y="20" font-size="12">${escape(error ?? "Missing engine output")}</text>`,
    };
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
    const a = scene(row.native.graph, row.native.error),
      b = scene(row.elk.graph, row.elk.error),
      previous = before
        ? scene(before.rows[index].native.graph, before.rows[index].native.error)
        : undefined,
      points = [...a.bounds, ...b.bounds, ...(previous?.bounds ?? [])];
    const left = Math.min(0, ...points.map((p) => p.x)) - 20,
      top = Math.min(0, ...points.map((p) => p.y)) - 20;
    const width = Math.max(points.length ? 0 : 300, ...points.map((p) => p.x)) - left + 20,
      height = Math.max(points.length ? 0 : 50, ...points.map((p) => p.y)) - top + 20;
    const svg = (s) =>
      `<svg viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}" role="img">${s.markup}</svg>`;
    return `<section id="case-${index}" hidden><p>Seed ${row.seed} · ${row.direction} · ${row.differences.length} differing values</p><div class="pair">${previous ? `<article><h2>Native before</h2>${svg(previous)}</article>` : ""}<article><h2>${previous ? "Native after" : "Native Stately"}</h2>${svg(a)}</article><article><h2>Real ELK 0.11.1</h2>${svg(b)}</article></div></section>`;
  })
  .join("\n");
const options = report.rows
  .map(
    (r, index) =>
      `<option value="${index}">${r.family ? escape(r.family) + " · " : ""}${r.direction} seed ${escape(r.seed)}${r.strategy ? " · " + escape(r.strategy) : ""}</option>`,
  )
  .join("");
fs.writeFileSync(
  `${root}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:14px system-ui;margin:24px;color:#172033}header{position:sticky;top:0;background:white;padding:12px 0}.pair{display:flex;gap:24px;align-items:flex-start}article{border:1px solid #ddd;padding:12px;overflow:auto;flex:1;min-width:0}h2{font-size:14px}svg{display:block;width:100%;height:auto}select{font:inherit}</style><header><h1>${title}</h1><p>${report.summary.matched}/${report.summary.cases} full matches. Equal viewports and scale across every view; original routes preserved.</p><label>Graph <select id="cases">${options}</select></label> · <a href="report.json">Complete inputs, outputs and differences</a> · <a href="worker-phases.json">Real ELK phases</a></header>${entries}<script>const select=document.querySelector('#cases');function show(){const i=Math.max(0,Math.min(select.options.length-1,Number(location.hash.slice(1))||0));select.value=i;document.querySelectorAll('section').forEach((s,n)=>s.hidden=n!==i)}select.onchange=()=>location.hash=select.value;onhashchange=show;show()</script>`,
);
