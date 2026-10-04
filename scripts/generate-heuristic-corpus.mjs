import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createGraph } from "@statelyai/graph";
import { getLayeredLayout, getLayoutRoutes, routeToPolylines } from "../dist/index.mjs";

import ELK from "elkjs/lib/elk.bundled.js";
import { measureQuality } from "./heuristic-quality.mjs";
import { toElkInput, fromElkOutput } from "./heuristic-elk-comparison.mjs";

// Both engines receive identical graph inputs. Failures remain visible, never resampled.
const elk = new ELK();
const elkVersion = createRequire(import.meta.url)("elkjs/package.json").version;
const output = process.argv[3]
  ? pathToFileURL(`${resolve(process.argv[3])}/`)
  : new URL("../docs/heuristics/generated/", import.meta.url);
await mkdir(output, { recursive: true });
const baseSeed = Number(process.argv[2] ?? 20261001);
if (!Number.isSafeInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffffffff)
  throw new Error("Seed must be an unsigned 32-bit integer");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const escape = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const colors = ["#2563eb", "#9333ea", "#059669", "#d97706", "#db2777"];
const profiles = [
  ["Flat · small", 6, 0, 7, "right"],
  ["Flat · cycles", 10, 0, 14, "down"],
  ["Flat · mixed ports", 15, 0, 22, "right"],
  ["Flat · disconnected", 22, 0, 27, "left"],
  ["Flat · denser", 32, 0, 52, "down"],
  ["Hierarchy · two groups", 8, 2, 11, "right"],
  ["Hierarchy · nested", 12, 3, 19, "down"],
  ["Hierarchy · mixed ports", 18, 4, 29, "right"],
  ["Hierarchy · deeper", 24, 5, 38, "up"],
  ["Hierarchy · denser", 32, 6, 54, "right"],
];
const corpus = [];
for (const [index, [title, count, groups, edgeCount, direction]] of profiles.entries()) {
  const seed = (baseSeed + index * 7919) >>> 0;
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const nodes = [];
  for (let i = 0; i < groups; i++)
    nodes.push({
      id: `G${i + 1}`,
      width: 140,
      height: 36,
      parentId: i >= 2 ? `G${i - 1}` : null,
    });
  for (let i = 0; i < count; i++) {
    const width = integer(80, 160),
      height = integer(48, 100);
    const ports = [];
    // At most one port per side: no crowded/degenerate inputs.
    for (const side of ["WEST", "EAST", "NORTH", "SOUTH"])
      if (random() < (index < 2 ? 0.2 : 0.55))
        ports.push({
          name: side.toLowerCase(),
          direction: "inout",
          width: 6,
          height: 6,
          x: side === "WEST" ? 0 : side === "EAST" ? width : width / 2,
          y: side === "NORTH" ? 0 : side === "SOUTH" ? height : height / 2,
          data: { side },
        });
    nodes.push({
      id: `N${i + 1}`,
      width,
      height,
      ports,
      parentId:
        groups && i < groups
          ? `G${i + 1}`
          : groups && random() < 0.85
            ? `G${integer(1, groups)}`
            : null,
    });
  }
  const edges = [],
    degree = new Map(nodes.map((n) => [n.id, 0]));
  const add = (source, target, allowParallel = false) => {
    if (
      (degree.get(source.id) ?? 0) + (source === target ? 2 : 1) > 6 ||
      (degree.get(target.id) ?? 0) >= 6
    )
      return false;
    if (!allowParallel && edges.some((e) => e.sourceId === source.id && e.targetId === target.id))
      return false;
    const choosePort = (node) =>
      node.ports?.length && random() < 0.7
        ? node.ports[integer(0, node.ports.length - 1)].name
        : undefined;
    const labeled = random() < 0.6;
    const id = `E${edges.length + 1}`;
    edges.push({
      id,
      sourceId: source.id,
      targetId: target.id,
      sourcePort: choosePort(source),
      targetPort: choosePort(target),
      width: labeled ? id.length * 7 + 16 : 0,
      height: labeled ? 22 : 0,
    });
    degree.set(source.id, degree.get(source.id) + 1);
    degree.set(target.id, degree.get(target.id) + 1);
    return true;
  };
  const leaves = nodes.slice(groups);
  if (groups) {
    add(leaves[0], leaves[1]); // Guaranteed cross-boundary edge.
    add(nodes[0], leaves[0]); // Parent/child endpoint.
    add(leaves.at(-1), leaves[0]);
  }
  if (index !== 3) {
    add(leaves[0], leaves[1]);
    add(leaves[1], leaves[2]);
    add(leaves[2], leaves[0]);
  }
  if (index >= 1) add(leaves[3], leaves[3]);
  if (index >= 2) {
    add(leaves[4], leaves[5]);
    add(leaves[4], leaves[5], true);
  }
  for (let attempts = 0; edges.length < edgeCount && attempts < 10000; attempts++) {
    // Preserve two disconnected components and one isolated leaf in profile 4.
    const pool =
      index === 3 ? (random() < 0.5 ? leaves.slice(0, 10) : leaves.slice(10, 21)) : nodes;
    if (!pool.length) continue;
    add(pool[integer(0, pool.length - 1)], pool[integer(0, pool.length - 1)]);
  }
  const input = { nodes, edges };
  const options = {
    direction,
    padding: 24,
    spacing: { node: 36, layer: 56 },
    nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
    portSettings: (port) => ({ "port.side": port.data.side }),
    compound: () => ({ header: { width: 140, height: 36, side: "top" } }),
  };
  const entry = {
    id: index + 1,
    title,
    seed,
    direction,
    input,
    options: {
      direction,
      padding: 24,
      spacing: options.spacing,
      portConstraints: "FIXED_POS",
      header: { width: 140, height: 36 },
    },
  };
  try {
    const layout = getLayeredLayout(createGraph(input), options);
    const scene = renderScene(layout, getLayoutRoutes(layout), input, title, `stately-${entry.id}`);
    entry.layout = scene.layout;
    entry.stately = scene;
  } catch (error) {
    entry.error = String(error);
    entry.stately = { error: String(error) };
  }
  try {
    const raw = await elk.layout(toElkInput(input, direction));
    const { layout, routes } = fromElkOutput(raw, input);
    entry.elk = { ...renderScene(layout, routes, input, title, `elk-${entry.id}`), raw };
  } catch (error) {
    entry.elk = { error: String(error) };
  }
  const scenes = [entry.stately, entry.elk].filter((scene) => scene.bounds);
  if (scenes.length) {
    const x = Math.min(...scenes.map((scene) => scene.bounds.x));
    const y = Math.min(...scenes.map((scene) => scene.bounds.y));
    const width = Math.max(...scenes.map((scene) => scene.bounds.x + scene.bounds.width)) - x;
    const height = Math.max(...scenes.map((scene) => scene.bounds.y + scene.bounds.height)) - y;
    for (const [engine, scene] of [
      ["stately", entry.stately],
      ["elk", entry.elk],
    ]) {
      if (!scene.svg) continue;
      scene.svg = scene.svg.replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${width} ${height}"`);
      await writeFile(new URL(`graph-${entry.id}-${engine}.svg`, output), scene.svg);
    }
    // Preserve the original Stately SVG URL.
    if (entry.stately.svg)
      await writeFile(new URL(`graph-${entry.id}.svg`, output), entry.stately.svg);
  }
  corpus.push(entry);
}
await writeFile(
  new URL("corpus.json", output),
  JSON.stringify(
    {
      baseSeed,
      revision,
      engine: "stately-layered",
      elkOracle: { package: "elkjs", version: elkVersion, entry: "elkjs/lib/elk.bundled.js" },
      cases: corpus.map(({ stately, elk, ...entry }) => ({
        ...entry,
        stately: { stats: stately.stats, metrics: stately.metrics, error: stately.error },
        elk: {
          layout: elk.layout,
          stats: elk.stats,
          metrics: elk.metrics,
          error: elk.error,
          raw: elk.raw,
        },
      })),
    },
    null,
    2,
  ) + "\n",
);

function renderScene(layout, routes, input, title, prefix) {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const world = layout.nodes.map((node) => {
    let x = node.x,
      y = node.y,
      parent = node.parentId;
    while (parent) {
      const ancestor = byId.get(parent);
      x += ancestor.x;
      y += ancestor.y;
      parent = ancestor.parentId;
    }
    return { ...node, x, y };
  });

  const paths = layout.edges.flatMap((edge) => {
    const route = routes.get(edge.id);
    return (route ? routeToPolylines(route) : [edge.points ?? []]).map((points, section) => ({
      edgeId: edge.id,
      section,
      points,
    }));
  });
  for (const rect of [...world, ...layout.edges])
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite))
      throw new Error(`Non-finite geometry: ${rect.id}`);
  for (const path of paths)
    for (const point of path.points)
      if (![point.x, point.y].every(Number.isFinite))
        throw new Error(`Non-finite route: ${path.edgeId}`);
  const points = [
    ...world.flatMap((n) => [
      { x: n.x, y: n.y },
      { x: n.x + n.width, y: n.y + n.height },
    ]),
    ...layout.edges.flatMap((e) => [
      { x: e.x, y: e.y },
      { x: e.x + e.width, y: e.y + e.height },
    ]),
    ...paths.flatMap((p) => p.points),
  ];
  const x = Math.min(...points.map((p) => p.x)) - 24,
    y = Math.min(...points.map((p) => p.y)) - 24;
  const width = Math.max(...points.map((p) => p.x)) - x + 24,
    height = Math.max(...points.map((p) => p.y)) - y + 24;
  const containers = new Set(input.nodes.map((n) => n.parentId).filter(Boolean));
  const rects = world
    .map(
      (n) =>
        `<g><title>${escape(n.id)} · ${n.width} × ${n.height} · parent ${n.parentId ?? "none"}</title><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="6" fill="${containers.has(n.id) ? "#f1f5f9" : "#fff"}" stroke="#94a3b8"/><text x="${n.x + 10}" y="${n.y + 23}" font-size="13">${n.id}</text></g>`,
    )
    .join("");
  const lines = paths
    .map((p) => {
      const edge = input.edges.find((e) => e.id === p.edgeId);
      const color = colors[(Number(p.edgeId.slice(1)) - 1) % colors.length];
      const last = paths.filter((s) => s.edgeId === p.edgeId).at(-1) === p;
      return `<polyline points="${p.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" ${last ? `marker-end="url(#${prefix}-arrow${colors.indexOf(color)})"` : ""}><title>${p.edgeId}: ${edge.sourceId}${edge.sourcePort ? `:${edge.sourcePort}` : ""} → ${edge.targetId}${edge.targetPort ? `:${edge.targetPort}` : ""}</title></polyline>`;
    })
    .join("");
  const labels = layout.edges
    .filter((e) => e.width)
    .map(
      (e) =>
        `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="4" fill="#fff" stroke="#cbd5e1"/><text x="${e.x + 8}" y="${e.y + 15}" font-size="11">${e.id}</text>`,
    )
    .join("");
  const ports = world
    .flatMap((n) =>
      (n.ports ?? []).map(
        (p) =>
          `<circle cx="${n.x + p.x + (p.width ?? 0) / 2}" cy="${n.y + p.y + (p.height ?? 0) / 2}" r="3.5" fill="#0f172a"><title>${n.id}:${p.name}</title></circle>`,
      ),
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" role="img" aria-label="${escape(title)}" style="font-family:system-ui;background:white"><defs>${colors.map((color, i) => `<marker id="${prefix}-arrow${i}" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L6,3 L0,6" fill="${color}"/></marker>`).join("")}</defs>${rects}${lines}${labels}${ports}</svg>`;

  const diagonalSegments = paths.reduce(
    (sum, path) =>
      sum +
      path.points
        .slice(1)
        .filter(
          (p, i) =>
            Math.abs(p.x - path.points[i].x) > 1e-6 && Math.abs(p.y - path.points[i].y) > 1e-6,
        ).length,
    0,
  );
  return {
    metrics: measureQuality({ ...layout, routes: [...routes] }, input),
    svg,
    bounds: { x, y, width, height },
    stats: {
      fallbackRoutes: [...routes.values()].filter((r) => r.status !== "routed").length,
      diagonalSegments,
      blockedRoutes: [...routes.values()].filter((r) =>
        r.diagnostics.some((d) => d.code === "ROUTE_BLOCKED"),
      ).length,
      budgetFailures: [...routes.values()].filter((r) =>
        r.diagnostics.some((d) => d.code === "SEARCH_BUDGET"),
      ).length,
      routeConflicts: [...routes.values()].filter((r) =>
        r.diagnostics.some((d) => d.code === "ROUTE_CONFLICT"),
      ).length,
    },
    layout: {
      nodes: layout.nodes,
      edges: layout.edges,
      routes: [...routes],
      compoundGeometry: [...(layout.compoundGeometry ?? [])],
    },
  };
}
const panel = (c, engine) => {
  const scene = c[engine];
  const diagnostics =
    engine === "stately" && scene.stats
      ? `<details><summary>Native routing diagnostics</summary>${scene.stats.blockedRoutes} blocked routes · ${scene.stats.budgetFailures} budget failures · ${scene.stats.routeConflicts} conflict diagnostics</details>`
      : "";
  return `<div id="panel-${c.id}-${engine}" role="group" aria-labelledby="caption-${c.id}-${engine}" data-engine="${engine}"><p class="engine-caption" id="caption-${c.id}-${engine}"><strong>${engine === "elk" ? `Real ELK ${elkVersion}` : "Stately native"}</strong> · <a href="graph-${c.id}-${engine}.svg">Open SVG</a></p><div class="scene">${scene.svg ?? `<pre>${escape(scene.error)}</pre>`}</div>${diagnostics}</div>`;
};
const comparison = (c) => {
  const metrics = [
    ["Node intersections", "nodeHits"],
    ["Label / node overlaps", "labelNodeOverlaps"],
    ["Label overlaps", "labelOverlaps"],
    ["Diagonal segments", "diagonals"],
    ["Self-retracing length", "selfRetraceLength"],
    ["Crossings", "edgeCrossings"],
    ["Shared track length", "edgeOverlapLength"],
    ["Bends", "bends"],
  ];
  const number = (engine, key) =>
    c[engine].metrics
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(c[engine].metrics[key])
      : "Layout failed";
  return `<table class="metrics"><caption>Same geometry scorer; lower values are better. Crossings may be unavoidable.</caption><thead><tr><th scope="col">Metric</th><th scope="col">Stately</th><th scope="col">Real ELK</th></tr></thead><tbody>${metrics.map(([label, key]) => `<tr><th scope="row">${label}</th><td>${number("stately", key)}</td><td>${number("elk", key)}</td></tr>`).join("")}</tbody></table>`;
};
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stately / ELK · heuristic review</title><style>
body{font:15px system-ui;margin:24px;color:#0f172a;background:#f8fafc}header{max-width:900px}nav{display:flex;gap:6px;flex-wrap:wrap;position:sticky;top:0;background:#f8fafc;padding:12px 0;z-index:1}button,a{padding:8px;font:inherit}button{cursor:pointer;border:1px solid #94a3b8;border-radius:5px;background:white;color:#0f172a}button:focus-visible,a:focus-visible,textarea:focus-visible{outline:3px solid #2563eb;outline-offset:3px}section{scroll-margin-top:76px;background:white;border:1px solid #cbd5e1;border-radius:10px;padding:18px;margin:20px 0}h2{font-size:20px}.scene{overflow:auto;border:1px solid #e2e8f0}.scene svg{display:block;width:100%;min-width:320px}textarea{box-sizing:border-box;width:100%;min-height:100px;font:inherit;margin-top:8px}small{color:#475569}label{display:block;margin-top:16px}[role=tablist]{display:inline-flex;gap:4px;margin-right:12px}[role=tab][aria-selected=true]{background:#0f172a;color:white;border-color:#0f172a}.toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.engine-caption{font-size:13px;color:#475569}.engine-panels.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.engine-panels>div{min-width:0}.metrics{border-collapse:collapse;margin-top:16px;font-size:13px}.metrics caption{text-align:left;color:#475569;margin-bottom:8px}.metrics th,.metrics td{padding:5px 12px;border-bottom:1px solid #e2e8f0;text-align:right}.metrics th:first-child{text-align:left}details{font-size:12px;color:#475569;margin-top:6px}[hidden]{display:none!important}@media(max-width:600px){body{margin:12px}section{padding:12px}nav{gap:2px}h1{font-size:24px}}
</style><header><h1>Stately / ELK · 10 random graphs</h1><p>Judge nodes, labels, and edge routing. Compare identical inputs, direction, fixed ports, and spacing. Each pair shares one viewport and scale. Neither engine's defects are hidden. Hover elements for IDs.</p><small>Native source ${revision} · real elkjs ${elkVersion} · base seed ${baseSeed} · 0–4 ports/node (one/side), degree ≤6 · leaf sizes 80–160 × 48–100</small></header><nav>${corpus.map((c) => `<a href="#graph-${c.id}">${c.id}</a>`).join("")}<button id="export">Download review notes</button></nav>${corpus.map((c) => `<section id="graph-${c.id}"><h2>${c.id}. ${escape(c.title)}</h2><p>${c.input.nodes.length} nodes · ${c.input.edges.length} edges · direction ${c.direction} · seed ${c.seed}</p><div class="toolbar"><div role="tablist" aria-label="Layout engine for graph ${c.id}">${["compare", "stately", "elk"].map((engine) => `<button role="tab" id="tab-${c.id}-${engine}" aria-controls="engines-${c.id}" aria-selected="${engine === "compare"}" tabindex="${engine === "compare" ? 0 : -1}" data-engine="${engine}" data-id="${c.id}">${engine === "compare" ? "Compare" : engine === "stately" ? "Stately" : "Real ELK"}</button>`).join("")}</div><button class="zoom" data-id="${c.id}" data-factor="1.5" aria-label="Zoom in graph ${c.id}">Zoom +</button><button class="zoom" data-id="${c.id}" data-factor="0.6666667" aria-label="Zoom out graph ${c.id}">Zoom −</button></div><div id="engines-${c.id}" class="engine-panels compare" role="tabpanel" aria-labelledby="tab-${c.id}-compare">${panel(c, "stately")}${panel(c, "elk")}</div>${comparison(c)}<label for="notes-${c.id}">Your heuristics / observations</label><textarea id="notes-${c.id}" data-id="${c.id}" placeholder="What should improve? Which rule, priority, exceptions?"></textarea></section>`).join("")}
<script>
const key='stately-heuristic-review-${baseSeed}';let notes={};try{notes=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
document.querySelectorAll('textarea').forEach(t=>{t.value=notes[t.dataset.id]||'';t.addEventListener('input',()=>{notes[t.dataset.id]=t.value;try{localStorage.setItem(key,JSON.stringify(notes))}catch{}})});
function selectTab(button){const section=document.querySelector('#graph-'+button.dataset.id);section.querySelectorAll('[role=tab]').forEach(t=>{const active=t===button;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1});const panels=section.querySelector('.engine-panels');panels.classList.toggle('compare',button.dataset.engine==='compare');panels.setAttribute('aria-labelledby',button.id);panels.querySelectorAll('[data-engine]').forEach(p=>p.hidden=button.dataset.engine!=='compare'&&p.dataset.engine!==button.dataset.engine)}
document.querySelectorAll('[role=tab]').forEach(b=>{b.onclick=()=>selectTab(b);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...b.parentElement.querySelectorAll('[role=tab]')];const next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(tabs.indexOf(b)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];selectTab(next);next.focus()}}});
document.querySelectorAll('.zoom').forEach(b=>b.onclick=()=>{const section=document.querySelector('#graph-'+b.dataset.id);const scale=Math.max(0.25,Math.min(8,Number(section.dataset.scale||1)*Number(b.dataset.factor)));section.dataset.scale=scale;section.querySelectorAll('svg').forEach(svg=>svg.style.width=(scale*100)+'%')});
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify({baseSeed:${baseSeed},revision:'${revision}',elkVersion:'${elkVersion}',notes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='stately-heuristic-review-${baseSeed}.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
</script></html>`;
await writeFile(new URL("index.html", output), html);
console.log(
  JSON.stringify(
    corpus.map((c) => ({
      id: c.id,
      stately: c.stately.stats ?? c.stately.error,
      elk: c.elk.stats ?? c.elk.error,
    })),
  ),
);
if (corpus.some((c) => c.stately.error || c.elk.error)) process.exitCode = 1;
