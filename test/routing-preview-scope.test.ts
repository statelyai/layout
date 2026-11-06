import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import { routeEdges, updateRoutes, refineRoutes, toSvgPath } from "../src/routing";
import { createRoutingScheduler, routingStrategies, type RoutingUpdateScope } from "../src/routing";

const fixture = () =>
  createGraph({
    id: "preview",
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 300, y: 0, width: 40, height: 40 },
      { id: "c", x: 0, y: 100, width: 40, height: 40 },
      { id: "d", x: 300, y: 100, width: 40, height: 40 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "cd", sourceId: "c", targetId: "d" },
    ],
  });

it.each(Object.values(routingStrategies))(
  "honors selected previews for built-in $id",
  (strategy) => {
    const graph = fixture(),
      previous = strategy.route(graph);
    const next = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, y: node.y! + 10 })) };
    const result = strategy.update(next, previous, getDiff(graph, next), undefined, {
      kind: "selected",
      edgeIds: ["ab"],
    });
    expect(result.snapshot.metrics.affectedEdges).toBe(1);
    expect(result.snapshot.routes.get("cd")).toBe(previous.routes.get("cd"));
  },
);

it("freezes unrelated routes during preview and repairs all geometry on commit", () => {
  const graph = fixture(),
    previous = routeEdges({ graph });
  const next = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === "c" ? { ...node, y: 60 } : node)),
  };
  const changes = getDiff(graph, next);
  const preview = updateRoutes({
    previous,
    graph: next,
    changes,
    scope: { kind: "selected", edgeIds: ["ab"] },
  });
  expect(preview.patches.every((patch) => patch.edgeId === "ab")).toBe(true);
  expect(preview.snapshot.metrics.affectedEdges).toBe(1);
  expect(preview.snapshot.routes.get("cd")).toBe(previous.routes.get("cd"));
  const committed = refineRoutes({ previous: preview.snapshot });
  expect(committed.snapshot.metrics.affectedEdges).toBe(2);
  expect(committed.snapshot.routes.get("cd")).not.toBe(previous.routes.get("cd"));
  expect([...committed.snapshot.routes]).toEqual([...routeEdges({ graph: next }).routes]);
  for (const route of committed.snapshot.routes.values()) {
    expect(route.status).toBe("routed");
    for (const section of route.sections)
      expect(toSvgPath(section.path)).not.toMatch(/NaN|Infinity/);
  }
});

it("supports selecting a group of independent edges and an empty preview", () => {
  const graph = fixture(),
    previous = routeEdges({ graph });
  const next = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, y: node.y! + 20 })) };
  const changes = getDiff(graph, next);
  const empty = updateRoutes({
    graph: next,
    previous,
    changes,
    scope: { kind: "selected", edgeIds: [] },
  });
  expect(empty.patches).toEqual([]);
  expect(empty.snapshot.metrics.affectedEdges).toBe(0);
  const both = updateRoutes({
    graph: next,
    previous,
    changes,
    scope: { kind: "selected", edgeIds: ["ab", "cd"] },
  });
  expect(both.snapshot.metrics.affectedEdges).toBe(2);
  expect(() =>
    updateRoutes({
      graph: next,
      previous,
      changes,
      scope: { kind: "selected", edgeIds: ["missing"] },
    }),
  ).toThrow(/Unknown selected/);
});

it("keeps topology changes coherent despite a preview selection", () => {
  const graph = fixture(),
    previous = routeEdges({ graph });
  const next = createGraph({ ...graph, edges: graph.edges.filter((edge) => edge.id !== "cd") });
  const result = updateRoutes({
    graph: next,
    previous,
    changes: getDiff(graph, next),
    scope: { kind: "selected", edgeIds: [] },
  });
  expect(result.snapshot.routes.has("cd")).toBe(false);
});

it("does not freeze a retargeted edge or global policy edits", () => {
  const graph = fixture(),
    previous = routeEdges({ graph });
  const next = {
    ...graph,
    edges: graph.edges.map((edge) => (edge.id === "cd" ? { ...edge, sourceId: "a" } : edge)),
  };
  const rewired = updateRoutes({
    graph: next,
    previous,
    changes: getDiff(graph, next),
    scope: { kind: "selected", edgeIds: [] },
  });
  expect(rewired.snapshot.routes.get("cd")).not.toBe(previous.routes.get("cd"));
  expect([...rewired.snapshot.routes]).toEqual([...routeEdges({ graph: next }).routes]);
  const configured = updateRoutes({
    graph,
    previous,
    changes: getDiff(graph, graph),
    settings: { clearance: 12 },
    scope: { kind: "selected", edgeIds: [] },
  });
  expect(configured.snapshot.metrics.affectedEdges).toBe(2);
});

it("does not retain an attachment to a removed port", () => {
  const base = fixture();
  const graph = createGraph({
    ...base,
    nodes: base.nodes.map((node) => ({
      ...node,
      ports: node.id === "a" ? [{ name: "out", x: 40, y: 20 }] : [],
    })),
    edges: base.edges.map((edge) => (edge.id === "ab" ? { ...edge, sourcePort: "out" } : edge)),
  });
  const previous = routeEdges({ graph });
  const next = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, ports: [] })) };
  const result = updateRoutes({
    graph: next,
    previous,
    changes: getDiff(graph, next),
    scope: { kind: "selected", edgeIds: [] },
  });
  expect(result.snapshot.routes.get("ab")).not.toBe(previous.routes.get("ab"));
  expect([...result.snapshot.routes]).toEqual([...routeEdges({ graph: next }).routes]);
});

it("expands explicit coordination groups instead of rerouting half a shared group", () => {
  const graph = fixture();
  const settings = {
    coordination: { kind: "bus" as const },
    edges: { ab: { group: "shared" }, cd: { group: "shared" } },
  };
  const previous = routeEdges({ graph, settings });
  const next = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === "a" ? { ...node, x: -20 } : node)),
  };
  const result = updateRoutes({
    graph: next,
    previous,
    changes: getDiff(graph, next),
    scope: { kind: "selected", edgeIds: ["ab"] },
  });
  expect(result.snapshot.metrics.affectedEdges).toBe(2);
});

it("updates a whole label chain when one member is selected", () => {
  const base = fixture();
  const graph = {
    ...base,
    edges: base.edges.map((edge, index) => ({
      ...edge,
      x: 130,
      y: index * 100,
      width: 60,
      height: 30,
    })),
  };
  const previous = routeEdges({
    graph,
    settings: { edges: { cd: { sourceLabel: "ab" } }, policy: { label: { kind: "gap" } } },
  });
  const next = {
    ...graph,
    edges: graph.edges.map((edge) => (edge.id === "ab" ? { ...edge, x: 150 } : edge)),
  };
  const result = updateRoutes({
    graph: next,
    previous,
    changes: getDiff(graph, next),
    scope: { kind: "selected", edgeIds: ["cd"] },
  });
  expect(result.snapshot.metrics.affectedEdges).toBe(2);
  expect(result.snapshot.routes.get("ab")).not.toBe(previous.routes.get("ab"));
});

it.each([false, true])(
  "coalesces preview selections; an ordinary edit takes precedence (%s)",
  async (ordinary) => {
    const graph = fixture(),
      scopes: (RoutingUpdateScope | undefined)[] = [];
    const next = {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === "a" ? { ...node, x: -10 } : node)),
    };
    const last = {
      ...next,
      nodes: next.nodes.map((node) => (node.id === "c" ? { ...node, x: -10 } : node)),
    };
    const scheduler = createRoutingScheduler({
      snapshot: routeEdges({ graph }),
      onUpdate() {},
      onError(error) {
        throw error;
      },
      update(options) {
        scopes.push(options.scope);
        return updateRoutes(options);
      },
    });
    scheduler.enqueue({
      graph: next,
      changes: getDiff(graph, next),
      scope: ordinary ? undefined : { kind: "selected", edgeIds: ["ab"] },
    });
    scheduler.enqueue({
      graph: last,
      changes: getDiff(next, last),
      scope: { kind: "selected", edgeIds: ["cd"] },
    });
    await scheduler.flush();
    expect(scopes).toEqual([ordinary ? undefined : { kind: "selected", edgeIds: ["ab", "cd"] }]);
    scheduler.dispose();
  },
);
