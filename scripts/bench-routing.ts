import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { cpus, loadavg } from "node:os";
import { routingFixtures, routingDragFrames } from "../bench/routing-fixtures";
import * as currentRouting from "../src/routing";

const modulePath = process.env.ROUTING_BENCH_MODULE;
const routing: typeof currentRouting = modulePath
  ? await import(pathToFileURL(modulePath).href)
  : currentRouting;
const frames = Number(process.env.ROUTING_BENCH_FRAMES ?? 60);
const trials = Number(process.env.ROUTING_BENCH_TRIALS ?? 5);
const sizes = (process.env.ROUTING_BENCH_SIZES ?? "100,1000").split(",").map(Number);
const fixtureFilter = process.env.ROUTING_BENCH_FILTER;
if (![frames, trials, ...sizes].every((n) => Number.isSafeInteger(n) && n > 0))
  throw new Error("Benchmark sizes, frames and trials must be positive integers");

function percentile(values: readonly number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}
function distribution(values: readonly number[]) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
  };
}

const results = [];
for (const fixture of routingFixtures(sizes)) {
  if (fixtureFilter && !fixture.name.includes(fixtureFilter)) continue;
  const strategy = routing.routingStrategies[fixture.strategy];
  const edits = routingDragFrames(fixture, frames);
  let warm = strategy.route(fixture.graph, fixture.settings);
  for (const edit of edits.slice(0, 5))
    warm = strategy.update(edit.graph, warm, edit.diff).snapshot;
  const timings: number[] = [],
    consumerTimings: number[] = [],
    perTrial = [];
  let patches = 0,
    routedEdges = 0,
    affectedEdges = 0,
    searchNodes = 0,
    fallbacks = 0,
    svgBytes = 0;
  for (let trial = 0; trial < trials; trial++) {
    let snapshot = strategy.route(fixture.graph, fixture.settings);
    let renderedRoutes = snapshot.routes;
    const trialTimings: number[] = [];
    const heapBefore = process.memoryUsage().heapUsed;
    for (const edit of edits) {
      const start = performance.now();
      const update = strategy.update(edit.graph, snapshot, edit.diff);
      const updateMs = performance.now() - start;
      renderedRoutes = routing.applyRoutePatches(renderedRoutes, update.patches);
      for (const patch of update.patches)
        if (patch.op === "set") {
          for (const section of patch.route.sections) {
            const svg = routing.toSvgPath(section.path);
            if (/NaN|Infinity/.test(svg)) throw new Error(`Nonfinite route in ${fixture.name}`);
            svgBytes += svg.length;
          }
          if (patch.route.status === "fallback") fallbacks++;
        }
      consumerTimings.push(performance.now() - start);
      if (update.base !== snapshot || renderedRoutes.size !== edit.graph.edges.length)
        throw new Error(`Invalid update in ${fixture.name}`);
      snapshot = update.snapshot;
      timings.push(updateMs);
      trialTimings.push(updateMs);
      patches += update.patches.length;
      routedEdges += snapshot.metrics.routedEdges;
      affectedEdges += snapshot.metrics.affectedEdges;
      searchNodes += snapshot.metrics.searchNodes;
    }
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    const fresh = strategy.route(edits.at(-1)!.graph, fixture.settings);
    if (JSON.stringify([...snapshot.routes]) !== JSON.stringify([...fresh.routes]))
      throw new Error(`Incremental/fresh mismatch in ${fixture.name}`);
    if (JSON.stringify([...renderedRoutes]) !== JSON.stringify([...snapshot.routes]))
      throw new Error(`Patch application mismatch in ${fixture.name}`);
    perTrial.push({
      updateMs: distribution(trialTimings),
      heapDeltaBytes,
    });
  }
  results.push({
    fixture: fixture.name,
    edges: fixture.graph.edges.length,
    frames,
    trials,
    updateMs: distribution(timings),
    updateAndRenderMs: distribution(consumerTimings),
    patches,
    routedEdges,
    affectedEdges,
    searchNodes,
    fallbacks,
    svgBytes,
    errors: 0,
    perTrial,
  });
}
if (!results.length) throw new Error("No benchmark fixtures matched");
process.stdout.write(
  `${JSON.stringify({ node: process.version, cores: cpus().length, loadAverage: loadavg(), scope: "Synchronous routing, patch application and SVG serialization; edit resolution, initial route, final fresh-equivalence check and browser rendering excluded. Heap deltas include GC noise and are not allocation counts.", results }, null, 2)}\n`,
);
