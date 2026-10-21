import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  flattenPath,
  getPathBounds,
  routingStrategies,
  toSvgPath,
  type RouteBounds,
  type RoutePath,
} from "../src/routing";
import {
  routingQualityFixtures,
  routingStrategyFixtures,
  routingCoordinationFixtures,
  routingCurveFamilies,
  getRoutingQualityFixture,
} from "../stories/routing-quality-fixtures";

const output = resolve(process.argv[2] ?? ".scratch/routing-quality-pass/after");
const baseline = process.argv[3];
const strategies: typeof routingStrategies = baseline
  ? (await import(pathToFileURL(resolve(baseline)).href)).routingStrategies
  : routingStrategies;
const revision = baseline
  ? (process.env.ROUTING_BASELINE_REVISION ?? "external baseline; source revision unverified")
  : execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceHashes = baseline
  ? null
  : Object.fromEntries(
      readdirSync("src/routing")
        .filter((name) => name.endsWith(".ts"))
        .map((name) => [`src/routing/${name}`, hash(`src/routing/${name}`)]),
    );
const curveFixture = getRoutingQualityFixture("multiple-obstacles");
const fixtures = [
  ...routingQualityFixtures,
  ...routingStrategyFixtures,
  ...routingCoordinationFixtures,
  ...routingCurveFamilies.map((curve) => ({
    ...curveFixture,
    id: `curve-${curve.kind}`,
    title: `Same obstacles / ${curve.kind}`,
    settings: {
      ...curveFixture.settings,
      policy: { ...curveFixture.settings.policy, curve },
    },
  })),
];
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[s]!,
  );
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);
function crosses(path: RoutePath) {
  const points = flattenPath(path, { tolerance: 0.1 });
  const orientation = (a: typeof path.start, b: typeof path.start, c: typeof path.start) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  let intersections = 0;
  for (let i = 1; i < points.length; i++)
    for (let j = i + 2; j < points.length; j++) {
      const a = points[i - 1]!,
        b = points[i]!,
        c = points[j - 1]!,
        d = points[j]!;
      if (
        orientation(a, b, c) * orientation(a, b, d) < -1e-8 &&
        orientation(c, d, a) * orientation(c, d, b) < -1e-8
      )
        intersections++;
    }
  return intersections;
}
mkdirSync(output, { recursive: true });
const records = fixtures.map((fixture) => {
  const snapshot = strategies[fixture.strategy].route(fixture.graph, fixture.settings);
  const routes = [...snapshot.routes.values()];
  const bounds: RouteBounds[] = fixture.graph.nodes.map((node) => ({
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
  }));
  const shared = new Set<string>();
  const paths = routes
    .flatMap((route) =>
      route.sections
        .filter((section) => {
          bounds.push(getPathBounds(section.path));
          if (!section.sharedId) return true;
          if (shared.has(section.sharedId)) return false;
          shared.add(section.sharedId);
          return true;
        })
        .map((section) => {
          const edge = fixture.graph.edges.find((edge) => edge.id === route.edgeId)!;
          const target = section.to.kind === "node" && section.to.nodeId === edge.targetId;
          return `<path data-edge="${escape(route.edgeId)}" d="${toSvgPath(section.path)}" fill="none" stroke="${route.status === "fallback" ? "#bb6821" : "#3158aa"}" stroke-width="2.5"${target ? ' marker-end="url(#arrow)"' : ""}/>`;
        }),
    )
    .join("");
  const nodes = fixture.graph.nodes
    .map(
      (node) =>
        `<g><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6" fill="${fixture.graph.edges.some((edge) => edge.sourceId === node.id || edge.targetId === node.id) ? "#eef2f8" : "#f6e6dc"}" stroke="#71809b"/><text x="${(node.x ?? 0) + (node.width ?? 0) / 2}" y="${(node.y ?? 0) + (node.height ?? 0) / 2 + 5}" text-anchor="middle">${escape(node.id)}</text></g>`,
    )
    .join("");
  const labels = fixture.graph.edges
    .filter((edge) => edge.width && edge.height)
    .map((edge) => {
      const b = snapshot.routes.get(edge.id)?.label?.bounds ?? {
        x: edge.x ?? 0,
        y: edge.y ?? 0,
        width: edge.width!,
        height: edge.height!,
      };
      bounds.push(b);
      return `<g><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="4" fill="white" stroke="#9b80ad"/><text x="${b.x + b.width / 2}" y="${b.y + b.height / 2 + 5}" text-anchor="middle">Label</text></g>`;
    })
    .join("");
  const x = Math.min(0, ...bounds.map((b) => b.x)) - 32,
    y = Math.min(0, ...bounds.map((b) => b.y)) - 32;
  const frame = {
    x,
    y,
    width: Math.max(560, ...bounds.map((b) => b.x + b.width)) - x + 32,
    height: Math.max(340, ...bounds.map((b) => b.y + b.height)) - y + 32,
  };
  const measurements = routes.map((route) => ({
    edgeId: route.edgeId,
    status: route.status,
    sections: route.sections.length,
    segments: route.sections.reduce((n, s) => n + s.path.segments.length, 0),
    length: route.sections.reduce((n, s) => {
      const p = flattenPath(s.path, { tolerance: 0.02 });
      return n + p.slice(1).reduce((sum, point, i) => sum + distance(p[i]!, point), 0);
    }, 0),
    selfCrossings: route.sections.reduce((n, s) => n + crosses(s.path), 0),
    diagnostics: route.diagnostics.map((d) => d.code),
  }));
  const body = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3158aa"/></marker></defs><style>text{font:14px system-ui,sans-serif;fill:#26334d}</style>${paths}${nodes}${labels}`;
  return {
    id: fixture.id,
    title: fixture.title,
    description: fixture.description,
    strategy: fixture.strategy,
    graph: fixture.graph,
    settings: fixture.settings,
    frame,
    measurements,
    routes,
    body,
  };
});
writeFileSync(join(output, "routes.json"), JSON.stringify(records, null, 2) + "\n");
writeFileSync(
  join(output, "metadata.json"),
  JSON.stringify(
    {
      revision,
      baselinePackage: baseline ?? null,
      baselineModuleHash: baseline ? hash(resolve(baseline)) : null,
      sourceHashes,
      fixtureHash: hash("stories/routing-quality-fixtures.ts"),
      cases: records.length,
      direction: "authored",
      deviceScaleFactor: 1,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      cases: records.length,
      routes: records.reduce((n, r) => n + r.routes.length, 0),
      emptyRoutes: records.flatMap((r) =>
        r.measurements.filter((m) => !m.sections).map((m) => `${r.id}/${m.edgeId}`),
      ),
      selfCrossings: records
        .filter((r) => r.measurements.some((m) => m.selfCrossings))
        .map((r) => ({ id: r.id, count: r.measurements.reduce((n, m) => n + m.selfCrossings, 0) })),
    },
    null,
    2,
  ),
);
