import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const usage =
  "pnpm exec tsx scripts/render-authoring-routing-quality.mjs [output-directory] <baseline-dist/index.mjs>\nThe baseline module may instead be supplied through AUTHORING_PROOF_BASELINE.\nAUTHORING_PROOF_PROJECT selects the current source checkout.\nAUTHORING_PROOF_BASELINE_REVISION records a requested revision without verifying its provenance.\nROUTING_BROWSER_MODULE selects the Playwright module (default @playwright/test).";
if (process.argv[2] === "--help") {
  console.log(usage);
  process.exit(0);
}
const baselineArgument = process.argv[3] ?? process.env.AUTHORING_PROOF_BASELINE;
if (!baselineArgument) throw new Error(`A compiled baseline module is required.\n${usage}`);
const baselinePath = resolve(baselineArgument);
const requestedBaselineRevision = process.env.AUTHORING_PROOF_BASELINE_REVISION ?? null;
const baselineModuleSha256 = createHash("sha256")
  .update(await readFile(baselinePath))
  .digest("hex");
const project = resolve(process.env.AUTHORING_PROOF_PROJECT ?? process.cwd());
const output = resolve(process.argv[2] ?? ".scratch/authoring-proof");
const currentRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: project,
  encoding: "utf8",
}).trim();
const current = await import(pathToFileURL(resolve(project, "src/index.ts")).href);
const baseline = await import(pathToFileURL(baselinePath).href);
assert.equal(typeof baseline.getLayout, "function", "Baseline module must export getLayout");
const { authoringRequest, defaults } = await import(
  pathToFileURL(resolve(project, "stories/authoring-fixtures.ts")).href
);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ROUTING_BROWSER_MODULE ?? "@playwright/test");
await mkdir(output, { recursive: true });

const gallery = authoringRequest(defaults).request;
const nested = authoringRequest({ ...defaults, scenario: "nested" }).request;
const nestedRouting = structuredClone(gallery);
nestedRouting.graph.nodes = [
  { ...gallery.graph.nodes[0], id: "parent", x: 1000, y: 2000, width: 700, height: 400 },
  ...gallery.graph.nodes.map((node) => ({ ...node, parentId: "parent" })),
];
nestedRouting.scope = { mode: "route-only", previous: nestedRouting.graph };
const cases = [
  {
    id: "gallery-partial",
    source: "stories/authoring-fixtures.ts authoringRequest(defaults)",
    request: gallery,
  },
  {
    id: "gallery-route-only",
    source: "gallery graph with equivalent public route-only scope",
    request: {
      ...gallery,
      scope: { mode: "route-only", previous: gallery.graph, edgeIds: ["ab"] },
    },
  },
  {
    id: "gallery-required-waypoint",
    source: "gallery graph with required waypoint from test/partial-routing-quality.test.ts",
    request: {
      ...gallery,
      scope: { mode: "route-only", previous: gallery.graph },
      constraints: [current.c.waypoint({ id: "via", edgeId: "ab", point: { x: 275, y: 62 } })],
    },
  },
  {
    id: "gallery-nested-leaf",
    source: "stories/authoring-fixtures.ts authoringRequest({...defaults,scenario:'nested'})",
    request: nested,
  },
  {
    id: "nested-route-only",
    source: "gallery scene nested exactly as test/partial-routing-quality.test.ts",
    request: nestedRouting,
  },
];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const world = (graph) => {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const offset = (node) => {
    const parent = node.parentId == null ? undefined : byId.get(node.parentId);
    if (!parent) return { x: 0, y: 0 };
    const ancestor = offset(parent);
    return { x: ancestor.x + parent.x, y: ancestor.y + parent.y };
  };
  return {
    nodes: graph.nodes.map((node) => {
      const p = offset(node);
      return { ...node, x: node.x + p.x, y: node.y + p.y };
    }),
    edges: graph.edges.map((edge) => {
      const source = byId.get(edge.sourceId),
        target = byId.get(edge.targetId);
      const p =
        graph.edgeCoordinateSpace !== "world" &&
        (source.parentId ?? null) === (target.parentId ?? null)
          ? offset(source)
          : { x: 0, y: 0 };
      return {
        ...edge,
        x: edge.x + p.x,
        y: edge.y + p.y,
        points: edge.points?.map((point) => ({ x: point.x + p.x, y: point.y + p.y })),
      };
    }),
  };
};
const escape = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
function render(id, stage, result, frame) {
  const geometry = result.graph && world(result.graph);
  const markup = geometry
    ? `<g transform="translate(${frame.tx},${frame.ty}) scale(${frame.scale})">${geometry.nodes.map((node) => `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="5" fill="${node.id === "parent" ? "#f5f7fa" : "#edf2f8"}" stroke="#63758b"/><text x="${node.x + node.width / 2}" y="${node.y + (node.id === "parent" ? 18 : node.height / 2 + 4)}" text-anchor="middle">${escape(node.id)}</text>`).join("")}${geometry.edges.map((edge) => `<polyline data-edge="${escape(edge.id)}" points="${edge.points?.map((p) => `${p.x},${p.y}`).join(" ") ?? ""}" fill="none" stroke="#a76412" stroke-width="2" marker-end="url(#arrow)"/>${edge.width > 0 ? `<rect x="${edge.x}" y="${edge.y}" width="${edge.width}" height="${edge.height}" rx="4" fill="#fff6e3" stroke="#a76412"/><text x="${edge.x + edge.width / 2}" y="${edge.y + edge.height / 2 + 4}" text-anchor="middle">${escape(edge.id)}</text>` : ""}`).join("")}</g>`
    : `<text x="70" y="220" fill="#a82020">${escape(JSON.stringify(result.error))}</text>`;
  const label =
    stage === "before"
      ? `Requested baseline ${requestedBaselineRevision ?? "module"} · sha256 ${baselineModuleSha256.slice(0, 12)}`
      : `Current working source (${currentRevision.slice(0, 7)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1550" height="950" viewBox="0 0 1550 950"><style>text{font:16px Arial,sans-serif;fill:#182334}.title{font-size:28px;font-weight:bold}.meta{font-size:16px;fill:#526174}</style><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="#25374b"/></marker></defs><rect width="1550" height="950" fill="#fff"/><text x="50" y="60" class="title">${escape(id)}</text><text x="50" y="95" class="meta">${escape(label)} · public getLayout · identical input and frame</text><text x="50" y="125" class="meta">${result.status === "ok" ? `${result.patches.length} patches · ${result.diagnostics.length} diagnostics` : "CONSTRAINT OR LAYOUT FAILURE"}</text>${markup}</svg>`;
}
const records = [];
for (const item of cases) {
  const request = JSON.parse(JSON.stringify(item.request));
  const beforeInput = structuredClone(request),
    afterInput = structuredClone(request);
  assert.deepEqual(beforeInput, afterInput);
  const run = async (api, input) => {
    try {
      const result = await api.getLayout(input);
      return {
        status: "ok",
        graph: result.graph,
        patches: result.patches,
        diagnostics: result.diagnostics,
      };
    } catch (error) {
      return { status: "error", error: { code: error.code, message: error.message } };
    }
  };
  const before = await run(baseline, beforeInput);
  const after = await run(current, afterInput);
  assert.deepEqual(beforeInput, request, `${item.id}: baseline mutated input`);
  assert.deepEqual(afterInput, request, `${item.id}: current mutated input`);
  const all = [before, after].filter((r) => r.status === "ok").flatMap((r) => world(r.graph).nodes);
  const left = Math.min(
    ...all.map((r) => r.x),
    ...[before, after]
      .filter((r) => r.status === "ok")
      .flatMap((r) => world(r.graph).edges.map((e) => e.x)),
  );
  const top = Math.min(...all.map((r) => r.y));
  const right = Math.max(...all.map((r) => r.x + r.width));
  const bottom = Math.max(
    ...all.map((r) => r.y + r.height),
    ...[before, after]
      .filter((r) => r.status === "ok")
      .flatMap((r) => world(r.graph).edges.map((e) => e.y + e.height)),
  );
  const scale = Math.min(2.4, 1360 / (right - left + 80), 650 / (bottom - top + 80));
  const frame = { scale, tx: 100 - (left - 20) * scale, ty: 210 - (top - 20) * scale };
  const measure = (result) => {
    if (result.status !== "ok") return result;
    const obstacle = result.graph.nodes.find((n) => n.id === "fixed");
    const points = result.graph.edges.find((e) => e.id === "ab")?.points;
    const clearance =
      obstacle &&
      points &&
      Math.min(
        ...points.slice(1).map((b, i) => {
          const a = points[i];
          return Math.hypot(
            Math.max(
              obstacle.x - Math.max(a.x, b.x),
              Math.min(a.x, b.x) - obstacle.x - obstacle.width,
              0,
            ),
            Math.max(
              obstacle.y - Math.max(a.y, b.y),
              Math.min(a.y, b.y) - obstacle.y - obstacle.height,
              0,
            ),
          );
        }),
      );
    const solved = world(result.graph);
    const constraintSatisfaction = (request.constraints ?? []).map((constraint) => {
      let satisfied = false;
      if (constraint.kind === "waypoint") {
        const route = solved.edges.find((edge) => edge.id === constraint.edgeId)?.points ?? [];
        const p = constraint.point;
        satisfied = route.some((b, i) => {
          const a = route[i - 1];
          return (
            a &&
            Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) < 1e-6 &&
            p.x >= Math.min(a.x, b.x) &&
            p.x <= Math.max(a.x, b.x) &&
            p.y >= Math.min(a.y, b.y) &&
            p.y <= Math.max(a.y, b.y)
          );
        });
      } else if (constraint.kind === "pin" && constraint.entity.nodeId) {
        const node = solved.nodes.find((node) => node.id === constraint.entity.nodeId);
        satisfied =
          node &&
          (constraint.x === undefined || node.x === constraint.x) &&
          (constraint.y === undefined || node.y === constraint.y);
      }
      return { id: constraint.id, kind: constraint.kind, satisfied };
    });
    const selected = request.scope.mode === "partial" ? (request.scope.nodeIds ?? []) : [];
    const fixedNodesPreserved = request.graph.nodes.every(
      (node) =>
        selected.includes(node.id) ||
        JSON.stringify(node) === JSON.stringify(result.graph.nodes.find((n) => n.id === node.id)),
    );
    return {
      ...result,
      obstacleClearance: clearance,
      routePoints: points,
      fixedNodesPreserved,
      constraintSatisfaction,
    };
  };
  const record = {
    id: item.id,
    source: item.source,
    input: request,
    inputHashBefore: hash(beforeInput),
    inputHashAfter: hash(afterInput),
    inputEqual: true,
    inputUnmutated: true,
    frame,
    before: measure(before),
    after: measure(after),
  };
  records.push(record);
  await writeFile(resolve(output, `${item.id}.json`), JSON.stringify(record, null, 2) + "\n");
  for (const [stage, result] of [
    ["before", before],
    ["after", after],
  ])
    await writeFile(
      resolve(output, `${item.id}-${stage}.svg`),
      render(item.id, stage, result, frame),
    );
}
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1550, height: 950 },
  deviceScaleFactor: 1,
});
const browserReport = [];
try {
  for (const record of records)
    for (const stage of ["before", "after"]) {
      const name = `${record.id}-${stage}`;
      await page.goto(pathToFileURL(resolve(output, `${name}.svg`)).href);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.locator("polyline[data-edge]").evaluateAll((lines) =>
        lines.map((line) => ({
          edge: line.getAttribute("data-edge"),
          points: line.getAttribute("points"),
          length: line.getTotalLength(),
        })),
      );
      await page.screenshot({ path: resolve(output, `${name}.png`) });
      browserReport.push({ name, viewport: { width: 1550, height: 950 }, geometry });
    }
} finally {
  await browser.close();
}
const summary = {
  baseline: {
    requestedRevision: requestedBaselineRevision,
    module: baselinePath,
    moduleSha256: baselineModuleSha256,
  },
  current: {
    revision: currentRevision,
    project,
    workingTreeDirty:
      execFileSync("git", ["status", "--porcelain"], { cwd: project, encoding: "utf8" }).trim()
        .length > 0,
    sourceSha256: Object.fromEntries(
      await Promise.all(
        [
          "src/index.ts",
          "src/authoring/routing.ts",
          "src/authoring/partial.ts",
          "stories/authoring-fixtures.ts",
        ].map(async (name) => [
          name,
          createHash("sha256")
            .update(await readFile(resolve(project, name)))
            .digest("hex"),
        ]),
      ),
    ),
  },
  viewport: { width: 1550, height: 950 },
  font: "Arial,sans-serif",
  cases: records.map(
    ({
      id,
      source,
      inputHashBefore,
      inputHashAfter,
      inputEqual,
      inputUnmutated,
      before,
      after,
    }) => ({
      id,
      source,
      inputHashBefore,
      inputHashAfter,
      inputEqual,
      inputUnmutated,
      beforeStatus: before.status,
      afterStatus: after.status,
      beforeClearance: before.obstacleClearance,
      afterClearance: after.obstacleClearance,
      beforeConstraints: before.constraintSatisfaction,
      afterConstraints: after.constraintSatisfaction,
      beforeFixedNodesPreserved: before.fixedNodesPreserved,
      afterFixedNodesPreserved: after.fixedNodesPreserved,
      beforeError: before.error,
      afterError: after.error,
    }),
  ),
};
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(resolve(output, "browser.json"), JSON.stringify(browserReport, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
if (
  records.some((record) =>
    [record.before, record.after].some(
      (result) =>
        result.status !== "ok" ||
        !result.fixedNodesPreserved ||
        result.constraintSatisfaction.some((constraint) => !constraint.satisfied),
    ),
  )
)
  process.exitCode = 1;
