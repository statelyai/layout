import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import {
  applyRoutePatches,
  routingStrategies,
  orthogonalRouting,
  toSvgPath,
  flattenPath,
  type Route,
  type RoutingGraph,
} from "../src/routing";
import { crossesRect } from "../src/authoring/routing";

function graph() {
  return createGraph({
    id: "test",
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 300, y: 0, width: 40, height: 40 },
      { id: "block", x: 120, y: -20, width: 60, height: 80 },
      { id: "c", x: 0, y: 1000, width: 40, height: 40 },
      { id: "d", x: 300, y: 1000, width: 40, height: 40 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "cd", sourceId: "c", targetId: "d" },
    ],
  });
}
function move(g: RoutingGraph, id: string, changes: object): RoutingGraph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...changes } : n)) };
}
function visible(route: Route) {
  expect(route.sections.length).toBeGreaterThan(0);
  for (const s of route.sections) {
    expect(toSvgPath(s.path)).not.toMatch(/NaN|Infinity/);
    expect(flattenPath(s.path).length).toBeGreaterThan(1);
  }
}
function avoids(route: Route, rect: { x: number; y: number; width: number; height: number }) {
  for (const section of route.sections) {
    const points = flattenPath(section.path, { tolerance: 0.01 });
    for (let i = 1; i < points.length; i++)
      expect(crossesRect(points[i - 1]!, points[i]!, rect)).toBe(false);
  }
}

describe.each(Object.entries(routingStrategies))("%s routing", (_name, strategy) => {
  it("returns a visible route for every edge without mutating the graph", () => {
    const g = graph(),
      before = structuredClone(g),
      result = strategy.route(g);
    expect(result.routes.size).toBe(2);
    result.routes.forEach(visible);
    expect(g).toEqual(before);
  });
  it("incrementally routes a moved node, preserves unrelated references and previous snapshots", () => {
    const g = graph(),
      previous = strategy.route(g),
      before = [...previous.routes],
      next = move(g, "a", { y: 50 });
    const update = strategy.update(next, previous, getDiff(g, next));
    expect(update.base).toBe(previous);
    expect(update.snapshot.revision).toBe(1);
    expect(update.snapshot.routes.get("cd")).toBe(previous.routes.get("cd"));
    expect(update.snapshot.metrics.routedEdges).toBe(1);
    expect(update.patches.map((p) => p.edgeId)).toEqual(["ab"]);
    expect([...previous.routes]).toEqual(before);
    expect([...applyRoutePatches(previous.routes, update.patches)]).toEqual([
      ...update.snapshot.routes,
    ]);
    expect(strategy.update(next, previous, getDiff(g, next))).toEqual(update);
  });
  it("does no search on a no-op diff", () => {
    const g = graph(),
      previous = strategy.route(g),
      result = strategy.update(g, previous, getDiff(g, g));
    expect(result.patches).toEqual([]);
    expect(result.snapshot.routes).toBe(previous.routes);
    expect(result.snapshot.metrics.searchNodes).toBe(0);
    expect(result.snapshot.metrics.routedEdges).toBe(0);
  });
  it("keeps impossible routes visible and exposes fallback diagnostics", () => {
    const g = move(graph(), "block", { x: -100, y: -100, width: 500, height: 500 });
    const route = strategy.route(g).routes.get("ab")!;
    visible(route);
    expect(route.status).toBe("fallback");
    expect(route.diagnostics.length).toBeGreaterThan(0);
  });
  it("handles edge addition and deletion", () => {
    const g = graph(),
      previous = strategy.route(g),
      next = { ...g, edges: [{ ...g.edges[0]!, id: "new" }] };
    const update = strategy.update(next, previous, getDiff(g, next));
    expect([...update.snapshot.routes.keys()]).toEqual(["new"]);
    expect(update.patches.filter((p) => p.op === "delete").map((p) => p.edgeId)).toEqual([
      "ab",
      "cd",
    ]);
  });
});

describe("routing dependencies", () => {
  it("repairs a nonincident edge when a new obstacle intersects its route", () => {
    const g = move(graph(), "block", { y: 200 }),
      previous = orthogonalRouting.route(g),
      next = move(g, "block", { y: -20 });
    const result = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(result.snapshot.metrics.routedEdges).toBe(1);
    expect(result.patches.map((p) => p.edgeId)).toEqual(["ab"]);
    expect(result.snapshot.routes.get("ab")!.status).toBe("routed");
    avoids(result.snapshot.routes.get("ab")!, { x: 120, y: -20, width: 60, height: 80 });
  });
  it("shortens a detour when its obstacle moves away", () => {
    const g = graph(),
      previous = orthogonalRouting.route(g),
      next = move(g, "block", { y: 200 }),
      update = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(update.snapshot.routes.get("ab")).toEqual(
      orthogonalRouting.route(next).routes.get("ab"),
    );
    expect(update.patches.map((p) => p.edgeId)).toEqual(["ab"]);
  });
  it("retries fallback routes when blocking geometry is removed", () => {
    const g = move(graph(), "block", { x: -100, y: -100, width: 500, height: 500 }),
      previous = orthogonalRouting.route(g),
      next = { ...g, nodes: g.nodes.filter((n) => n.id !== "block") };
    const result = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(result.snapshot.routes.get("ab")!.status).toBe("routed");
  });
  it("moves label gaps and considers labels obstacles for unrelated edges", () => {
    const base = graph(),
      g = {
        ...base,
        edges: base.edges.map((e) =>
          e.id === "cd" ? { ...e, x: 180, y: 980, width: 40, height: 20 } : e,
        ),
      };
    const previous = orthogonalRouting.route(g),
      next = { ...g, edges: g.edges.map((e) => (e.id === "cd" ? { ...e, x: 200, y: 10 } : e)) };
    const update = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(update.snapshot.routes.get("cd")!.sections).toHaveLength(2);
    avoids(update.snapshot.routes.get("ab")!, { x: 200, y: 10, width: 40, height: 20 });
  });
  it("resolves parent-relative coordinates and invalidates descendants on group movement", () => {
    const g = createGraph({
      id: "compound",
      nodes: [
        { id: "parent", x: 100, y: 100, width: 400, height: 200 },
        { id: "a", parentId: "parent", x: 20, y: 20, width: 40, height: 40 },
        { id: "b", parentId: "parent", x: 200, y: 20, width: 40, height: 40 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    const previous = orthogonalRouting.route(g),
      next = move(g, "parent", { x: 200 }),
      result = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(previous.routes.get("ab")!.sections[0]!.path.start.x).toBe(160);
    expect(result.snapshot.routes.get("ab")!.sections[0]!.path.start.x).toBe(260);
  });
  it("keeps settings and input geometry from mutating snapshots", () => {
    const g = graph(),
      config = { edges: { ab: { waypoints: [{ x: 80, y: 100 }] } } },
      previous = orthogonalRouting.route(g, config);
    config.edges.ab.waypoints[0]!.x = -400;
    g.nodes[0]!.x = -200;
    const empty = getDiff(g, g),
      result = orthogonalRouting.update(g, previous, empty);
    expect(result.snapshot.routes).toBe(previous.routes);
    expect(Object.isFrozen(previous.routes.get("ab"))).toBe(true);
  });
  it("rejects stale diffs and strategy mismatches", () => {
    const g = graph(),
      previous = orthogonalRouting.route(g),
      next = move(g, "a", { x: 20 }),
      update = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(() => orthogonalRouting.update(next, update.snapshot, getDiff(g, next))).toThrow(
      /Stale/,
    );
    expect(() => routingStrategies.polyline.update(next, previous, getDiff(g, next))).toThrow(
      /same routing strategy/,
    );
  });
});

describe("routing families", () => {
  const peers = () =>
    createGraph({
      id: "peers",
      nodes: [
        { id: "a", x: 0, y: 40, width: 40, height: 40 },
        { id: "b", x: 200, y: 0, width: 40, height: 40 },
        { id: "c", x: 200, y: 120, width: 40, height: 40 },
      ],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "ac", sourceId: "a", targetId: "c" },
      ],
    });
  it.each(["orthogonal", "polyline", "octilinear", "curved", "organic"] as const)(
    "%s avoids obstacles",
    (name) => {
      const g = graph(),
        result = routingStrategies[name].route(g).routes.get("ab")!;
      expect(result.status).toBe("routed");
      avoids(result, { x: 120, y: -20, width: 60, height: 80 });
      if (name === "orthogonal" || name === "octilinear")
        for (const s of result.sections) {
          const points = flattenPath(s.path);
          for (let i = 1; i < points.length; i++) {
            const dx = Math.abs(points[i]!.x - points[i - 1]!.x),
              dy = Math.abs(points[i]!.y - points[i - 1]!.y);
            expect(
              dx < 1e-8 || dy < 1e-8 || (name === "octilinear" && Math.abs(dx - dy) < 1e-8),
            ).toBe(true);
          }
        }
    },
  );
  it.each(["bus", "fan", "bundle"] as const)(
    "%s produces identical shared sections and incrementally updates the group",
    (name) => {
      const g = peers(),
        strategy = routingStrategies[name],
        previous = strategy.route(g);
      const a = previous.routes.get("ab")!,
        b = previous.routes.get("ac")!;
      visible(a);
      visible(b);
      expect(a.status).toBe("routed");
      expect(b.status).toBe("routed");
      const trunkA = a.sections.find((s) => s.sharedId)!,
        trunkB = b.sections.find((s) => s.sharedId)!;
      expect(trunkA.sharedId).toBe(trunkB.sharedId);
      expect(trunkA.path).toEqual(trunkB.path);
      const next = move(g, "b", { y: -50 }),
        result = strategy.update(next, previous, getDiff(g, next));
      expect(result.snapshot.metrics.routedEdges).toBe(2);
      expect(result.snapshot.routes.get("ab")!.sections.find((s) => s.sharedId)!.path).toEqual(
        result.snapshot.routes.get("ac")!.sections.find((s) => s.sharedId)!.path,
      );
    },
  );
  it("separates parallel edges", () => {
    const base = peers(),
      g = {
        ...base,
        edges: [base.edges[0]!, { ...base.edges[0]!, id: "ab2" }, { ...base.edges[0]!, id: "ab3" }],
      },
      result = routingStrategies.parallel.route(g);
    const paths = [...result.routes.values()].map((r) => {
      expect(r.status).toBe("routed");
      return toSvgPath(r.sections[0]!.path);
    });
    expect(new Set(paths).size).toBe(3);
  });
  it.each(Object.keys(routingStrategies) as (keyof typeof routingStrategies)[])(
    "%s draws self loops",
    (name) => {
      const base = peers(),
        g = { ...base, edges: [{ ...base.edges[0]!, targetId: "a" }] },
        result = routingStrategies[name].route(g).routes.get("ab")!;
      visible(result);
      expect(result.status).toBe("routed");
      avoids(result, { x: 0, y: 40, width: 40, height: 40 });
    },
  );
  it("updates port positions using the native graph diff", () => {
    const base = peers(),
      g = {
        ...base,
        nodes: base.nodes.map((n) =>
          n.id === "a"
            ? {
                ...n,
                ports: [
                  {
                    name: "out",
                    direction: "out" as const,
                    data: null,
                    x: 40,
                    y: 5,
                    width: 0,
                    height: 0,
                  },
                ],
              }
            : n,
        ),
        edges: base.edges.map((e) => ({ ...e, sourcePort: "out" })),
      };
    const previous = orthogonalRouting.route(g),
      next = {
        ...g,
        nodes: g.nodes.map((n) =>
          n.ports ? { ...n, ports: n.ports.map((p) => ({ ...p, y: 30 })) } : n,
        ),
      };
    const result = orthogonalRouting.update(next, previous, getDiff(g, next));
    expect(result.snapshot.routes.get("ab")!.sections[0]!.path.start).toEqual({ x: 40, y: 70 });
  });
  it("invalidates continuity when authored waypoints change", () => {
    const g = peers(),
      previous = orthogonalRouting.route(g),
      waypoint = { x: 100, y: -60 };
    const result = orthogonalRouting.update(g, previous, getDiff(g, g), {
      edges: { ab: { waypoints: [waypoint] } },
    });
    const points = flattenPath(result.snapshot.routes.get("ab")!.sections[0]!.path);
    expect(points).toContainEqual(waypoint);
  });
  it("only inspects a local region during a large-graph drag", () => {
    const g = createGraph({
      id: "large",
      nodes: Array.from({ length: 1000 }, (_, i) => [
        { id: `a${i}`, x: 0, y: i * 200, width: 40, height: 40 },
        { id: `b${i}`, x: 300, y: i * 200, width: 40, height: 40 },
      ]).flat(),
      edges: Array.from({ length: 1000 }, (_, i) => ({
        id: `edge${i}`,
        sourceId: `a${i}`,
        targetId: `b${i}`,
      })),
    });
    const previous = orthogonalRouting.route(g),
      next = move(g, "a500", { x: 20 }),
      diff = getDiff(g, next);
    const guarded = new Proxy(next, {
      get(target, key) {
        if (key === "nodes" || key === "edges")
          throw new Error("Incremental update scanned the graph");
        return Reflect.get(target, key);
      },
    });
    const result = orthogonalRouting.update(guarded, previous, diff);
    expect(result.snapshot.metrics.routedEdges).toBe(1);
    expect(result.snapshot.metrics.affectedEdges).toBe(1);
    expect(result.snapshot.metrics.obstacleCandidates).toBeLessThan(100);
    expect(result.patches).toHaveLength(1);
  });
});

it("reserves room for obstacle-safe curved corners", () => {
  const route = routingStrategies.curved.route(graph()).routes.get("ab")!;
  expect(route.status).toBe("routed");
  expect(route.sections.flatMap((s) => s.path.segments).some((s) => s.kind !== "line")).toBe(true);
  avoids(route, { x: 112, y: -28, width: 76, height: 96 });
});
it("reports search-budget fallback separately from blocked geometry", () => {
  const route = orthogonalRouting.route(graph(), { maxSearchNodes: 1 }).routes.get("ab")!;
  expect(route.status).toBe("fallback");
  expect(route.diagnostics.map((d) => d.code)).toContain("SEARCH_BUDGET");
  visible(route);
});
it("routes moved attachments identically to fresh routing", () => {
  const g = graph(),
    previous = orthogonalRouting.route(g),
    next = move(g, "a", { y: 5 });
  const result = orthogonalRouting
    .update(next, previous, getDiff(g, next))
    .snapshot.routes.get("ab")!;
  expect(result.status).toBe("routed");
  expect(result).toEqual(orthogonalRouting.route(next).routes.get("ab"));
  avoids(result, { x: 120, y: -20, width: 60, height: 80 });
});
it("updates endpoint references even when reconnected nodes share coordinates", () => {
  const base = graph(),
    g = { ...base, nodes: [...base.nodes, { ...base.nodes[0]!, id: "a2" }] },
    previous = routingStrategies.straight.route(g);
  const next = { ...g, edges: g.edges.map((e) => (e.id === "ab" ? { ...e, sourceId: "a2" } : e)) };
  const route = routingStrategies.straight
    .update(next, previous, getDiff(g, next))
    .snapshot.routes.get("ab")!;
  expect(route.sections[0]!.from).toEqual({ kind: "node", nodeId: "a2" });
});
it("routes parallel lanes around an obstacle instead of pinning lanes inside it", () => {
  const base = graph(),
    g = {
      ...base,
      edges: [base.edges[0]!, { ...base.edges[0]!, id: "ab2" }, { ...base.edges[0]!, id: "ab3" }],
    };
  const routes = routingStrategies.parallel.route(g).routes;
  const paths = [...routes.values()].map((route) => {
    expect(route.status).toBe("routed");
    avoids(route, { x: 120, y: -20, width: 60, height: 80 });
    return toSvgPath(route.sections[0]!.path);
  });
  expect(new Set(paths).size).toBe(3);
});

it("accepts a clear diagonal bezier even when an obstacle overlaps its bounding box", () => {
  const g = createGraph({
    id: "curve-clear",
    nodes: [
      { id: "a", x: 0, y: 200, width: 40, height: 40 },
      { id: "b", x: 400, y: 0, width: 40, height: 40 },
      { id: "block", x: 90, y: 35, width: 40, height: 40 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });
  const route = routingStrategies.bezier.route(g).routes.get("ab")!;
  expect(route.status).toBe("routed");
  expect(route.sections[0]!.path.segments[0]!.kind).toBe("cubic");
  avoids(route, { x: 82, y: 27, width: 56, height: 56 });
});

it.each(["orthogonal", "curved"] as const)(
  "%s stays compact across repeated drag frames",
  (style) => {
    const strategy = routingStrategies[style];
    let g: RoutingGraph = graph();
    let snapshot = strategy.route(g);
    for (let y = 3; y <= 240; y += 3) {
      const next = move(g, "a", { y });
      snapshot = strategy.update(next, snapshot, getDiff(g, next)).snapshot;
      g = next;
      const route = snapshot.routes.get("ab")!;
      expect(route.status).toBe("routed");
      const path = route.sections[0]!.path;
      expect(path.segments.length).toBeLessThanOrEqual(15);
      const points = [path.start, ...path.segments.map((s) => s.to)];
      for (let i = 2; i < points.length; i++) {
        const a = points[i - 2]!,
          b = points[i - 1]!,
          c = points[i]!;
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
        expect(Math.abs(cross) < 1e-8 && dot < -1e-8).toBe(false);
      }
    }
  },
);

it("searches a curved detour when the direct bezier is obstructed", () => {
  const route = routingStrategies.bezier.route(graph()).routes.get("ab")!;
  expect(route.status).toBe("routed");
  avoids(route, { x: 112, y: -28, width: 76, height: 96 });
  expect(route.sections[0]!.path.segments.some((s) => s.kind !== "line")).toBe(true);
});

it("aligns a label attachment with an adjacent terminal inside its border span", () => {
  const g = createGraph({
    id: "label-align",
    nodes: [
      { id: "a", x: 0, y: 0, width: 80, height: 44 },
      { id: "b", x: 350, y: 0, width: 80, height: 44 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", x: 200, y: 10, width: 72, height: 26 }],
  });
  const route = orthogonalRouting.route(g).routes.get("ab")!;
  for (const section of route.sections) {
    expect(section.path.start.y).toBe(22);
    expect(section.path.segments).toHaveLength(1);
    expect(section.path.segments[0]!.to.y).toBe(22);
  }
});

it.each(Object.keys(routingStrategies) as (keyof typeof routingStrategies)[])(
  "%s reaches identical geometry from opposite drag histories",
  (style) => {
    const strategy = routingStrategies[style];
    const final = graph();
    const arrive = (from: number) => {
      let g = move(final, "b", { y: from });
      let snapshot = strategy.route(g);
      for (let frame = 1; frame <= 20; frame++) {
        const next = move(g, "b", { y: from * (1 - frame / 20) });
        snapshot = strategy.update(next, snapshot, getDiff(g, next)).snapshot;
        g = next;
      }
      return [...snapshot.routes];
    };
    expect(arrive(-200)).toEqual([...strategy.route(final).routes]);
    expect(arrive(200)).toEqual([...strategy.route(final).routes]);
  },
);

it("orthogonal routing cannot accumulate bends during diagonal dragging", () => {
  let g: RoutingGraph = graph();
  let snapshot = orthogonalRouting.route(g);
  const initialCount = snapshot.routes.get("ab")!.sections[0]!.path.segments.length;
  for (let frame = 1; frame <= 80; frame++) {
    const next = move(g, "a", { x: -frame, y: frame / 2 });
    snapshot = orthogonalRouting.update(next, snapshot, getDiff(g, next)).snapshot;
    g = next;
    expect(snapshot.routes.get("ab")!.sections[0]!.path.segments.length).toBeLessThanOrEqual(
      initialCount + 2,
    );
  }
});

it("removing a nonincident obstacle restores the fresh-route result", () => {
  const g = graph(),
    previous = orthogonalRouting.route(g);
  const next = move(g, "block", { y: 500 });
  const result = orthogonalRouting.update(next, previous, getDiff(g, next));
  expect([...result.snapshot.routes]).toEqual([...orthogonalRouting.route(next).routes]);
  expect(result.snapshot.routes.get("cd")).toBe(previous.routes.get("cd"));
});

it.each(Object.keys(routingStrategies) as (keyof typeof routingStrategies)[])(
  "%s incremental obstacle changes match a fresh route",
  (style) => {
    const strategy = routingStrategies[style];
    const base = graph();
    let g: RoutingGraph = { ...base, edges: [...base.edges, { ...base.edges[0]!, id: "peer" }] };
    let snapshot = strategy.route(g);
    for (const [x, y] of [
      [200, 100],
      [120, -20],
      [100, -120],
      [140, 0],
      [150, 500],
      [120, -20],
    ]) {
      const next = move(g, "block", { x, y });
      const update = strategy.update(next, snapshot, getDiff(g, next));
      expect([...update.snapshot.routes]).toEqual([...strategy.route(next).routes]);
      expect(update.snapshot.routes.get("cd")).toBe(snapshot.routes.get("cd"));
      snapshot = update.snapshot;
      g = next;
    }
  },
);

it.each(Object.keys(routingStrategies) as (keyof typeof routingStrategies)[])(
  "%s mixed node and label updates equal fresh routing at every frame",
  (style) => {
    const strategy = routingStrategies[style];
    const base = graph();
    let g: RoutingGraph = {
      ...base,
      edges: base.edges.map((e) =>
        e.id === "ab" ? { ...e, x: 210, y: 120, width: 50, height: 24 } : e,
      ),
    };
    let snapshot = strategy.route(g);
    for (let frame = 0; frame < 16; frame++) {
      const next: RoutingGraph =
        frame % 2
          ? move(g, "a", { x: -frame * 2, y: frame * 3 })
          : {
              ...g,
              edges: g.edges.map((e) =>
                e.id === "ab" ? { ...e, x: 200 + frame * 2, y: 80 + frame * 4 } : e,
              ),
            };
      const update = strategy.update(next, snapshot, getDiff(g, next));
      expect([...update.snapshot.routes]).toEqual([...strategy.route(next).routes]);
      expect(update.snapshot.routes.get("cd")).toBe(snapshot.routes.get("cd"));
      snapshot = update.snapshot;
      g = next;
    }
  },
);
