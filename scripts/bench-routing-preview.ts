import { performance } from "node:perf_hooks";
import { cpus, loadavg } from "node:os";
import assert from "node:assert/strict";
import { routingFixtures, routingDragFrames } from "../bench/routing-fixtures";
import {
  routeEdges,
  updateRoutes,
  refineRoutes,
  applyRoutePatches,
  toSvgPath,
} from "../src/routing";

const sizes = (process.env.ROUTING_BENCH_SIZES ?? "100,1000").split(",").map(Number);
const frames = Number(process.env.ROUTING_BENCH_FRAMES ?? 20);
const trials = Number(process.env.ROUTING_BENCH_TRIALS ?? 5);
if (![frames, trials, ...sizes].every((value) => Number.isSafeInteger(value) && value > 0))
  throw new Error("Positive integer sizes/frames/trials required");
const summarize = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median:
      (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  };
};
const curves = [
  { kind: "polyline" },
  { kind: "bezier" },
  { kind: "catmull-rom" },
  { kind: "rounded-orthogonal" },
] as const;
const curve = curves.find(
  (value) => value.kind === (process.env.ROUTING_BENCH_CURVE ?? "polyline"),
);
if (!curve) throw new Error("Unknown benchmark curve");
const results = [];
for (const fixture of routingFixtures(sizes).filter((item) =>
  /^(sparse-|configured-|high-degree-|obstacle-corridors-)/.test(item.name),
)) {
  const settings = { ...fixture.settings, policy: { ...fixture.settings.policy, path: curve } };
  if (process.env.ROUTING_BENCH_FILTER && !fixture.name.includes(process.env.ROUTING_BENCH_FILTER))
    continue;
  const edits = routingDragFrames(fixture, frames);
  const incident = fixture.graph.edges
    .filter((edge) => edge.sourceId === fixture.movedNode || edge.targetId === fixture.movedNode)
    .map((edge) => edge.id);
  const selected = incident.length
    ? incident.slice(0, 2)
    : [fixture.graph.edges[Math.floor(fixture.graph.edges.length / 2)]!.id];
  for (let trial = -1; trial < trials; trial++) {
    const modes =
      trial % 2 ? (["selected", "affected"] as const) : (["affected", "selected"] as const);
    for (const mode of modes) {
      let snapshot = routeEdges({ graph: fixture.graph, settings });
      const preview: number[] = [],
        consumer: number[] = [];
      const initialFallbacks = [...snapshot.routes.values()].filter(
        (route) => route.status !== "routed",
      ).length;
      let work = 0,
        patches = 0,
        routedEdges = 0,
        searchNodes = 0,
        fallback = 0,
        svgBytes = 0;
      for (const edit of edits) {
        const before = snapshot,
          begin = performance.now();
        const update = updateRoutes({
          graph: edit.graph,
          previous: snapshot,
          changes: edit.diff,
          scope: mode === "selected" ? { kind: "selected", edgeIds: selected } : undefined,
        });
        preview.push(performance.now() - begin);
        const rendered = applyRoutePatches(snapshot.routes, update.patches);
        assert.equal(rendered.size, edit.graph.edges.length);
        const svgPaths: string[] = [];
        for (const patch of update.patches)
          if (patch.op === "set") {
            fallback += Number(patch.route.status !== "routed");
            for (const section of patch.route.sections) {
              const svg = toSvgPath(section.path);
              svgPaths.push(svg);
              svgBytes += svg.length;
            }
          }
        consumer.push(performance.now() - begin);
        for (const svg of svgPaths) assert(!/NaN|Infinity/.test(svg));
        snapshot = update.snapshot;
        for (const [id, route] of snapshot.routes) assert.equal(rendered.get(id), route);
        patches += update.patches.length;
        routedEdges += snapshot.metrics.routedEdges;
        searchNodes += snapshot.metrics.searchNodes;
        if (mode === "selected")
          for (const [id, route] of before.routes)
            if (!selected.includes(id)) assert.equal(snapshot.routes.get(id), route);
        work += snapshot.metrics.affectedEdges;
        assert(snapshot.metrics.affectedEdges > 0, "Benchmark accidentally timed a no-op");
      }
      const begin = performance.now();
      const commit = refineRoutes({ previous: snapshot });
      const commitMs = performance.now() - begin;
      assert.equal(commit.snapshot.metrics.affectedEdges, fixture.graph.edges.length);
      const fresh = routeEdges({ graph: edits.at(-1)!.graph, settings });
      assert.deepEqual([...commit.snapshot.routes], [...fresh.routes]);
      if (trial >= 0)
        results.push({
          fixture: fixture.name,
          curve: curve.kind,
          mode,
          trial,
          edges: fixture.graph.edges.length,
          selected: selected.length,
          frames,
          previewMs: summarize(preview),
          updateAndSvgMs: summarize(consumer),
          commitMs,
          affectedEdges: work,
          patches,
          routedEdges,
          searchNodes,
          initialFallbacks,
          commitFallbacks: [...commit.snapshot.routes.values()].filter(
            (route) => route.status !== "routed",
          ).length,
          fallback,
          svgBytes,
          errors: 0,
        });
    }
  }
}
assert(results.length, "No fixtures matched");
process.stdout.write(
  JSON.stringify(
    {
      node: process.version,
      cores: cpus().length,
      loadAverage: loadavg(),
      scope:
        "Routing plus patch application/SVG serialization, alternating modes after warmup; initial layout, graph diff/projection, DOM/rendering and fresh-equivalence checks excluded. Commit timing is full routing only. Fallback counts remain visible; errors abort the run.",
      results,
    },
    null,
    2,
  ) + "\n",
);
