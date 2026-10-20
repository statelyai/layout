import assert from "node:assert/strict";
import { createGraph, getDiff } from "@statelyai/graph";
import {
  routingStrategies,
  routingPolicies,
  segmentCrossesRect,
  toSvgPath,
  type RoutingPolicy,
  type RoutingSettings,
} from "../src/routing";

let randomState = 173;
const random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
const policies: readonly RoutingPolicy[] = [
  routingPolicies.smooth,
  routingPolicies.diagram,
  routingPolicies.authored,
  { curve: { kind: "polyline" } },
  {
    curve: { kind: "bezier" },
    sourceTangent: { kind: "border-normal" },
    targetTangent: { kind: "border-normal" },
  },
  {
    curve: { kind: "rounded-orthogonal", radius: 18 },
    monotonic: { axis: "x", strength: "require" },
  },
  {
    curve: { kind: "catmull-rom" },
    collisions: { nodes: "avoid", labels: "avoid", crossingPenalty: 200, overlapPenalty: 10 },
  },
];
const strategies = Object.values(routingStrategies);
let cases = 0;
let visibleRoutes = 0;
let reportedFallbacks = 0;
let emptyRoutes = 0;
const diagnosticCounts: Record<string, number> = {};
for (let seed = 0; seed < 8; seed++) {
  const graph = createGraph({
    id: `policy-seed-${seed}`,
    nodes: Array.from({ length: 6 }, (_, index) => ({
      id: `node-${index}`,
      x: (index % 3) * 230 + Math.round(random() * 40),
      y: Math.floor(index / 3) * 220 + Math.round(random() * 50),
      width: 55 + Math.round(random() * 20),
      height: 35 + Math.round(random() * 20),
    })),
    edges: [
      { id: "edge-a", sourceId: "node-0", targetId: "node-5" },
      { id: "edge-b", sourceId: "node-0", targetId: "node-2" },
      { id: "edge-c", sourceId: "node-3", targetId: "node-2" },
      { id: "edge-d", sourceId: "node-1", targetId: "node-4" },
    ],
  });
  const next = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === "node-1" ? { ...node, y: node.y! + 21 } : node)),
  };
  for (const strategy of strategies)
    for (const policy of policies) {
      const config: RoutingSettings = { policy, maxSearchNodes: 8000 };
      const context = `${seed}/${strategy.id}/${JSON.stringify(policy)}`;
      const initial = strategy.route(graph, config);
      const updated = strategy.update(next, initial, getDiff(graph, next)).snapshot;
      const fresh = strategy.route(next, config);
      assert.deepEqual(
        [...updated.routes],
        [...fresh.routes],
        `Incremental result differs at ${context}`,
      );
      assert.deepEqual(
        strategy.update(graph, initial, getDiff(graph, graph)).patches,
        [],
        `No-op changed routes at ${context}`,
      );
      const reordered = strategy.route(
        { ...next, nodes: [...next.nodes].reverse(), edges: [...next.edges].reverse() },
        config,
      );
      assert.deepEqual(
        [...reordered.routes].sort(([a], [b]) => a.localeCompare(b)),
        [...fresh.routes].sort(([a], [b]) => a.localeCompare(b)),
        `Input order changes geometry at ${context}`,
      );
      const shared = new Map<string, string>();
      for (const route of fresh.routes.values()) {
        if (!route.sections.length) emptyRoutes++;
        for (const diagnostic of route.diagnostics)
          diagnosticCounts[diagnostic.code] = (diagnosticCounts[diagnostic.code] ?? 0) + 1;
        assert(
          route.sections.length > 0 ||
            policy.monotonic?.strength === "require" ||
            route.diagnostics.some((diagnostic) => diagnostic.code === "SEARCH_BUDGET"),
          `Feasible unconstrained fixture has no visible fallback at ${context}/${route.edgeId}`,
        );
        if (route.status === "fallback") {
          reportedFallbacks++;
          assert(
            route.diagnostics.length > 0,
            `Fallback lacks diagnostics at ${context}/${route.edgeId}`,
          );
        }
        for (const section of route.sections) {
          visibleRoutes++;
          const svg = toSvgPath(section.path);
          assert(!/NaN|Infinity/.test(svg), `Nonfinite geometry at ${context}/${route.edgeId}`);
          if (section.sharedId) {
            assert(
              !shared.has(section.sharedId) || shared.get(section.sharedId) === svg,
              `Shared trunk differs at ${context}`,
            );
            shared.set(section.sharedId, svg);
          }
          let start = section.path.start;
          for (const segment of section.path.segments) {
            for (const node of next.nodes) {
              const rect = {
                x: node.x! + 1e-6,
                y: node.y! + 1e-6,
                width: node.width! - 2e-6,
                height: node.height! - 2e-6,
              };
              assert(
                !segmentCrossesRect(start, segment, rect),
                `Hard node collision at ${context}/${route.edgeId}/${node.id}`,
              );
            }
            start = segment.to;
          }
        }
      }
      cases++;
    }
}
console.log(
  JSON.stringify(
    {
      cases,
      visibleSections: visibleRoutes,
      reportedFallbacks,
      emptyRoutes,
      diagnostics: diagnosticCounts,
      seed: 173,
      checks: [
        "finite paths",
        "hard node clearance",
        "fresh/update equivalence",
        "no-op updates",
        "input order invariance",
        "fallback diagnostics",
        "shared trunk consistency",
      ],
    },
    null,
    2,
  ),
);
