import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import { flattenPath, orthogonalRouting, segmentCrossesRect } from "../src/routing";
import type { RoutingSettings } from "../src/routing/types";

const settings = {
  policy: {
    curve: { kind: "polyline" },
    sourceTangent: { kind: "border-normal" },
    targetTangent: { kind: "border-normal" },
    stability: { kind: "preserve-valid" },
  },
} satisfies RoutingSettings;

const input = () =>
  createGraph({
    id: "preserve-drag",
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 240, y: 0, width: 40, height: 40 },
      { id: "block", x: 100, y: -20, width: 80, height: 80 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });

it("retargets an eligible line corridor while its endpoints move", () => {
  let graph = input();
  let previous = orthogonalRouting.route(graph, settings);
  const oldPath = previous.routes.get("ab")!.sections[0]!.path;
  const oldPoints = flattenPath(oldPath);
  const corridor = oldPoints.find((point) => point.y < -20 || point.y > 60)!;
  expect(corridor).toBeDefined();
  for (let frame = 1; frame <= 30; frame++) {
    const next = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === "a"
          ? { ...node, x: frame / 10 }
          : node.id === "b"
            ? { ...node, y: frame }
            : { ...node, y: 300 },
      ),
    };
    const snapshot = orthogonalRouting.update(next, previous, getDiff(graph, next)).snapshot;
    const route = snapshot.routes.get("ab")!;
    const points = flattenPath(route.sections[0]!.path);
    expect(route.status).toBe("routed");
    expect(points.some((point) => point.y === corridor.y)).toBe(true);
    expect(points.length).toBeLessThanOrEqual(oldPoints.length + 2);
    expect(route.sections[0]!.path).not.toEqual(
      orthogonalRouting.route(next, settings).routes.get("ab")!.sections[0]!.path,
    );
    previous = snapshot;
    graph = next;
  }
});

it("rejects a preserved corridor when a new obstacle blocks it", () => {
  const graph = input();
  const previous = orthogonalRouting.route(graph, settings);
  const points = flattenPath(previous.routes.get("ab")!.sections[0]!.path);
  const track = points.find((point) => point.y < -20 || point.y > 60)!;
  const barrier = { id: "new", x: track.x - 3, y: track.y - 3, width: 6, height: 6 };
  const next = createGraph({ ...graph, nodes: [...graph.nodes, barrier] });
  const route = orthogonalRouting
    .update(next, previous, getDiff(graph, next))
    .snapshot.routes.get("ab")!;
  expect(route.status).toBe("routed");
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      expect(segmentCrossesRect(from, segment, barrier)).toBe(false);
      from = segment.to;
    }
  }
});

it("keeps the default recompute policy independent of endpoint drag history", () => {
  const graph = input();
  const previous = orthogonalRouting.route(graph);
  const next = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === "b" ? { ...node, y: 20 } : node)),
  };
  expect([
    ...orthogonalRouting.update(next, previous, getDiff(graph, next)).snapshot.routes,
  ]).toEqual([...orthogonalRouting.route(next).routes]);
});

it.each([false, true])(
  "preserves eligible marker-gap paths without accumulating trims (label=%s)",
  (labeled) => {
    const base = input();
    const graph = labeled
      ? {
          ...base,
          edges: base.edges.map((edge) => ({ ...edge, x: 100, y: 110, width: 80, height: 30 })),
        }
      : base;
    const options: RoutingSettings = {
      policy: {
        curve: { kind: "rounded-orthogonal", radius: 8 },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
        ...(labeled ? { label: { kind: "gap", tangent: { kind: "border-normal" } } } : {}),
        stability: { kind: "preserve-valid" },
      },
      edges: { ab: { sourceClearance: 5, targetClearance: 10 } },
    };
    const previous = orthogonalRouting.route(graph, options);
    const old = previous.routes.get("ab")!;
    expect(old.status).toBe("routed");
    const next = {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === "block" ? { ...node, y: 300 } : node)),
    };
    const update = orthogonalRouting.update(next, previous, getDiff(graph, next));
    expect(update.snapshot.routes.get("ab")).toBe(old);
    expect(update.patches).toEqual([]);
    const again = {
      ...next,
      nodes: next.nodes.map((node) => (node.id === "block" ? { ...node, y: 400 } : node)),
    };
    expect(
      orthogonalRouting
        .update(again, update.snapshot, getDiff(next, again))
        .snapshot.routes.get("ab"),
    ).toBe(old);
  },
);
