import { createGraph, getDiff } from "@statelyai/graph";
import { getPeleLayout } from "../src/pele";
import { createPeleRouting, segmentCrossesRect, updateRoutes } from "../src/routing";

// Synthetic dense workload, not the consumer's captured coffee-machine graph.
const names = [
  "off",
  "idle",
  "grinding",
  "heating",
  "brewing",
  "steaming",
  "cleaning",
  "error",
  "ready",
];
const input = createGraph({
  nodes: names.map((id) => ({ id, width: 120, height: 70 })),
  edges: names.flatMap((sourceId, i) =>
    [1, 3, 0].map((step, k) => ({
      id: `${sourceId}:${k}`,
      sourceId,
      targetId: names[(i + step) % names.length]!,
      width: 60,
      height: 24,
    })),
  ),
});
const layout = getPeleLayout(input);
const start = performance.now();
const handoff = createPeleRouting(layout, { clearance: 4, maxSearchNodes: 1000 });
const adoptionMs = performance.now() - start;
let graph = handoff.graph,
  previous = handoff.snapshot;
const id = "idle:0",
  origin = graph.edges.find((edge) => edge.id === id)!;
const frames: {
  ms: number;
  affected: number;
  search: number;
  fallback: boolean;
  empty: boolean;
  changed: boolean;
  curved: boolean;
  violations: number;
}[] = [];
for (let frame = 0; frame < 110; frame++) {
  const offset = Math.sin(frame / 10) * 18;
  const next = {
    ...graph,
    edges: graph.edges.map((edge) => (edge.id === id ? { ...edge, x: origin.x! + offset } : edge)),
  };
  const changes = getDiff(graph, next); // Deliberately excluded: host should emit operation diffs.
  const before = performance.now();
  const update = updateRoutes({ graph: next, previous, changes });
  const ms = performance.now() - before;
  const route = update.snapshot.routes.get(id)!;
  let violations = 0;
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      for (const bounds of [...next.nodes, ...next.edges]) {
        if (
          bounds.width &&
          bounds.height &&
          segmentCrossesRect(from, segment, {
            x: bounds.x!,
            y: bounds.y!,
            width: bounds.width,
            height: bounds.height,
          })
        )
          violations++;
      }
      from = segment.to;
    }
  }
  if (frame >= 10)
    frames.push({
      ms,
      changed: route !== previous.routes.get(id),
      curved: route.sections.some((section) =>
        section.path.segments.some((segment) => segment.kind === "cubic"),
      ),
      violations,
      affected: update.snapshot.metrics.affectedEdges,
      search: update.snapshot.metrics.searchNodes,
      fallback: update.snapshot.routes.get(id)!.status === "fallback",
      empty: !update.snapshot.routes.get(id)!.sections.length,
    });
  graph = next;
  previous = update.snapshot;
}
const sorted = frames.map((frame) => frame.ms).sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      nodes: input.nodes.length,
      edges: input.edges.length,
      warmup: 10,
      frames: frames.length,
      adoptionMs,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      maxMs: sorted.at(-1),
      maxAffected: Math.max(...frames.map((frame) => frame.affected)),
      maxSearchNodes: Math.max(...frames.map((frame) => frame.search)),
      changedFrames: frames.filter((frame) => frame.changed).length,
      curvedFrames: frames.filter((frame) => frame.curved).length,
      obstacleViolations: frames.reduce((sum, frame) => sum + frame.violations, 0),
      fallbackFrames: frames.filter((frame) => frame.fallback).length,
      emptyFrames: frames.filter((frame) => frame.empty).length,
      finalFallbackRoutes: [...previous.routes.values()].filter(
        (route) => route.status === "fallback",
      ).length,
    },
    null,
    2,
  ),
);
