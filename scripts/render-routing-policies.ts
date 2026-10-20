import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { routingStrategies, toSvgPath, type RoutingSettings } from "../src/routing";
import { routingPolicyFixtures, routingPolicySettings } from "./routing-policy-fixtures";

const output = resolve(process.argv[2] ?? ".scratch/routing-policies/before");
const after = process.argv.includes("--after");
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, "metadata.json"),
  JSON.stringify(
    {
      revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      settings: after ? "policy" : "original",
      viewBox: [0, 0, 560, 340],
      direction: "authored",
      deviceScaleFactor: 1,
    },
    null,
    2,
  ),
);
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
const records = routingPolicyFixtures.map((fixture) => {
  const settings: RoutingSettings = after ? routingPolicySettings[fixture.id]! : fixture.before;
  const snapshot = routingStrategies[fixture.strategy].route(fixture.graph, settings);
  const routes = [...snapshot.routes.values()];
  const shared = new Set<string>();
  const paths = routes
    .flatMap((route) =>
      route.sections
        .filter((section) => {
          if (!section.sharedId) return true;
          if (shared.has(section.sharedId)) return false;
          shared.add(section.sharedId);
          return true;
        })
        .map(
          (section) =>
            `<path data-edge="${escape(route.edgeId)}" d="${toSvgPath(section.path)}" fill="none" stroke="${route.status === "fallback" ? "#c06d20" : "#3158aa"}" stroke-width="2.5"/>`,
        ),
    )
    .join("");
  const nodes = fixture.graph.nodes
    .map(
      (node) =>
        `<g><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6" fill="${node.id === "obstacle" ? "#f6e6dc" : "#eef2f8"}" stroke="#71809b"/><text x="${node.x! + node.width! / 2}" y="${node.y! + node.height! / 2 + 5}" text-anchor="middle">${escape(node.id)}</text></g>`,
    )
    .join("");
  const labels = fixture.graph.edges
    .filter((edge) => edge.width && edge.height)
    .map((edge) => {
      const bounds = snapshot.routes.get(edge.id)?.label?.bounds ?? edge;
      return `<g><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="4" fill="white" stroke="#9b80ad"/><text x="${bounds.x! + bounds.width! / 2}" y="${bounds.y! + bounds.height! / 2 + 5}" text-anchor="middle">Label</text></g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="340" viewBox="0 0 560 340"><rect width="560" height="340" fill="white"/><style>text{font:14px system-ui,sans-serif;fill:#26334d}</style>${paths}${nodes}${labels}</svg>`;
  writeFileSync(join(output, `${fixture.id}.svg`), svg);
  return { id: fixture.id, title: fixture.title, fixture: fixture.graph, settings, routes, svg };
});
writeFileSync(
  join(output, "routes.json"),
  JSON.stringify(
    records.map(({ svg: _svg, ...record }) => record),
    null,
    2,
  ),
);
writeFileSync(
  join(output, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Routing policies</title><style>body{margin:0;padding:24px;background:#f0f2f6;color:#26334d;font:14px system-ui}main{display:grid;grid-template-columns:repeat(3,560px);gap:20px}article{background:white;border:1px solid #c9d0dc;border-radius:8px;overflow:hidden}h2{font-size:16px;margin:16px 18px 0}</style><main>${records.map((record) => `<article data-fixture="${record.id}"><h2>${escape(record.title)}</h2>${record.svg}</article>`).join("")}</main>`,
);
console.log(`Rendered ${records.length} fixtures to ${output}`);
