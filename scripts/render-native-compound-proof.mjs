import { readFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [baselineModule, playwrightModule] = process.argv.slice(2);
if (!baselineModule || !playwrightModule)
  throw new Error("Pass the published 0.2.0 module and Playwright module paths");
const { chromium } = await import(pathToFileURL(playwrightModule));
import { createGraph } from "@statelyai/graph";
import { getLayeredLayout as after } from "../dist/index.mjs";
const { getLayeredLayout: before } = await import(pathToFileURL(baselineModule));
const escape = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
mkdirSync("docs/images/native-compound", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 1100 },
  deviceScaleFactor: 1,
});
for (const name of ["editor-modes", "espresso"]) {
  const fixture = JSON.parse(
    readFileSync(
      `test/fixtures/${name === "espresso" ? "espresso" : "editor-modes"}-native.json`,
      "utf8",
    ),
  );
  const input = createGraph(fixture);
  const parents = new Set(input.nodes.map((n) => n.parentId));
  const options = {
    direction: "down",
    padding: 48,
    spacing: { node: 48, layer: 64 },
    settings: { separateConnectedComponents: false, "cycleBreaking.strategy": "MODEL_ORDER" },
    compound: (n) =>
      parents.has(n.id) ? { header: { width: n.width, height: n.height } } : undefined,
  };
  const outputs = [before(input, options), after(input, options)];
  const world = (graph) => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.nodes.map((n) => {
      let x = n.x,
        y = n.y,
        p = n.parentId;
      while (p) {
        const a = byId.get(p);
        x += a.x;
        y += a.y;
        p = a.parentId;
      }
      return { ...n, x, y };
    });
  };
  const scenes = outputs.map((g) => {
    const nodes = world(g);
    const focus =
      name === "espresso" ? nodes.find((n) => n.id === "espressoBar.portafilter") : null;
    const origin = focus ?? { x: 0, y: 0 };
    const selected = focus ? nodes.filter((n) => n.id.startsWith(focus.id)) : nodes;
    const edges = focus
      ? g.edges.filter((e) => e.sourceId.startsWith(focus.id) && e.targetId.startsWith(focus.id))
      : g.edges;
    return { g, nodes: selected, edges, origin };
  });
  const boxes = scenes.flatMap((s) =>
    [...s.nodes, ...s.edges].map((r) => ({
      x: r.x - s.origin.x,
      y: r.y - s.origin.y,
      width: r.width,
      height: r.height,
    })),
  );
  const x = Math.min(0, ...boxes.map((b) => b.x)) - 24,
    y = Math.min(0, ...boxes.map((b) => b.y)) - 24;
  const w = Math.max(...boxes.map((b) => b.x + b.width)) - x + 24,
    h = Math.max(...boxes.map((b) => b.y + b.height)) - y + 24;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const cards = s.nodes
      .map((n) => {
        const hdr = s.g.compoundGeometry?.get(n.id)?.header;
        const inputNode = input.nodes.find((r) => r.id === n.id);
        const compound = parents.has(n.id);
        const px = n.x - s.origin.x,
          py = n.y - s.origin.y;
        return `${compound ? `<rect x="${px}" y="${py}" width="${n.width}" height="${n.height}" fill="#1d2130" stroke="#788098"/>` : ""}<rect x="${px + (hdr?.x ?? 0)}" y="${py + (hdr?.y ?? 0)}" width="${compound ? (hdr?.width ?? inputNode.width) : n.width}" height="${compound ? (hdr?.height ?? inputNode.height) : n.height}" fill="#32384b" stroke="#788098"/><text x="${px + 8}" y="${py + 25}" fill="white" font-size="16">${escape(inputNode.label ?? n.id.split(".").at(-1))}</text>`;
      })
      .join("");
    const labels = s.edges
      .map(
        (e) =>
          `<rect x="${e.x - s.origin.x}" y="${e.y - s.origin.y}" width="${e.width}" height="${e.height}" rx="8" fill="#171b26" stroke="#b8a7ec"/><text x="${e.x - s.origin.x + 8}" y="${e.y - s.origin.y + 24}" fill="#eee" font-size="14">${escape(e.label ?? e.id)}</text>`,
      )
      .join("");
    await page.setContent(
      `<body style="margin:0;background:#10131b"><svg width="1400" height="1100" viewBox="${name === "espresso" ? -48 : x} ${name === "espresso" ? -48 : y} ${name === "espresso" ? 1750 : w} ${name === "espresso" ? 1375 : h}" style="font-family:Arial">${cards}${labels}</svg>`,
    );
    await page.screenshot({
      path: `docs/images/native-compound/${name}-${i === 0 ? "before" : "after"}.png`,
    });
  }
}
await browser.close();
