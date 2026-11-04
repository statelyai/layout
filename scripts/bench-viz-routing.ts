import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { cpus, loadavg } from "node:os";
import { getDiff } from "@statelyai/graph";
import {
  applyRoutePatches,
  orthogonalRouting,
  toSvgPath,
  type RoutingGraph,
  type RoutingSettings,
} from "../src/routing";

// Synthetic 150-state/300-transition projection from Viz's large routing pass test.
const fixture: { graph: RoutingGraph; settings: RoutingSettings } = JSON.parse(
  gunzipSync(
    readFileSync(new URL("../test/fixtures/viz-large-routing.json.gz", import.meta.url)),
  ).toString(),
);
const frames = Number(process.env.ROUTING_BENCH_FRAMES ?? 5);
const preserve = process.env.ROUTING_BENCH_PRESERVE !== "false";
const crossingPenalty = Number(process.env.ROUTING_BENCH_CROSSING_PENALTY ?? 0);
const overlapPenalty = Number(process.env.ROUTING_BENCH_OVERLAP_PENALTY ?? 8);
if (![crossingPenalty, overlapPenalty].every((value) => Number.isFinite(value) && value >= 0))
  throw new Error("Routing penalties must be finite and non-negative");
if (!Number.isSafeInteger(frames) || frames < 1)
  throw new Error("Frames must be a positive integer");
const settings: RoutingSettings = {
  ...fixture.settings,
  crossingPenalty,
  overlapPenalty,
  policy: {
    ...fixture.settings.policy,
    stability: { kind: preserve ? "preserve-valid" : "recompute" },
  },
};
let graph = fixture.graph;
const begin = performance.now();
let snapshot = orthogonalRouting.route(graph, settings);
const initialMs = performance.now() - begin;
let rendered = snapshot.routes;
const initialFallbacks = [...snapshot.routes.values()].filter(
  (route) => route.status === "fallback",
).length;
const initialEmpty = [...snapshot.routes.values()].filter((route) => !route.sections.length).length;
let svgBytes = 0;
const results = [];
for (const kind of ["node", "label"] as const) {
  const movedId =
    kind === "node"
      ? graph.nodes[Math.floor(graph.nodes.length / 2)]!.id
      : graph.edges[Math.floor(graph.edges.length / 2)]!.id;
  for (let frame = 1; frame <= frames; frame++) {
    const move = <T extends { id: string; x?: number; y?: number }>(entity: T): T =>
      entity.id === movedId
        ? { ...entity, x: (entity.x ?? 0) + 3, y: (entity.y ?? 0) + 2 }
        : entity;
    const next = {
      ...graph,
      nodes: kind === "node" ? graph.nodes.map(move) : graph.nodes,
      edges: kind === "label" ? graph.edges.map(move) : graph.edges,
    };
    const changes = getDiff(graph, next);
    const start = performance.now();
    const update = orthogonalRouting.update(next, snapshot, changes);
    const updateMs = performance.now() - start;
    rendered = applyRoutePatches(rendered, update.patches);
    let fallbacks = 0,
      empty = 0,
      hardFailures = 0;
    for (const patch of update.patches) {
      if (patch.op !== "set") continue;
      for (const section of patch.route.sections) {
        const svg = toSvgPath(section.path);
        if (/NaN|Infinity/.test(svg)) throw new Error("Nonfinite SVG route");
        svgBytes += svg.length;
      }
      if (patch.route.status === "fallback") fallbacks++;
      if (!patch.route.sections.length) empty++;
      if (
        patch.route.diagnostics.some(
          (diagnostic) =>
            diagnostic.code !== "ROUTE_CONFLICT" &&
            diagnostic.code !== "LABEL_OVERLAP" &&
            diagnostic.constraint !== "curve",
        )
      )
        hardFailures++;
    }
    if (update.base !== snapshot || rendered.size !== next.edges.length)
      throw new Error("Invalid route update");
    results.push({
      kind,
      frame,
      updateMs,
      updateAndSerializeMs: performance.now() - start,
      patches: update.patches.length,
      ...update.snapshot.metrics,
      fallbacks,
      empty,
      hardFailures,
    });
    snapshot = update.snapshot;
    graph = next;
  }
}
if (JSON.stringify([...rendered]) !== JSON.stringify([...snapshot.routes]))
  throw new Error("Route patches disagree with snapshot");
if (
  !preserve &&
  JSON.stringify([...snapshot.routes]) !==
    JSON.stringify([...orthogonalRouting.route(graph, settings).routes])
)
  throw new Error("Canonical incremental routes differ from fresh routing");
process.stdout.write(
  `${JSON.stringify({ node: process.version, cores: cpus().length, loadAverage: loadavg(), scope: "Synthetic Viz projection; synchronous routing, patch application and SVG serialization only. Graph diff production, browser paint, worker transfer excluded. Fallbacks and hard diagnostics are reported, not treated as successful routing.", preserve, crossingPenalty, overlapPenalty, nodes: graph.nodes.length, edges: graph.edges.length, initialMs, initialFallbacks, initialEmpty, results, svgBytes, errors: 0 }, null, 2)}\n`,
);
