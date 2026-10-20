import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import { busRouting, fanRouting, bundleRouting } from "../src/routing";

it.each([busRouting, fanRouting, bundleRouting])(
  "$id separates automatic duplicate target branches",
  (strategy) => {
    const graph = createGraph({
      id: "duplicate-branches",
      nodes: [
        { id: "a", x: 20, y: 100, width: 60, height: 60 },
        { id: "b", x: 380, y: 40, width: 60, height: 60 },
      ],
      edges: [
        { id: "first", sourceId: "a", targetId: "b" },
        { id: "second", sourceId: "a", targetId: "b" },
      ],
    });
    const snapshot = strategy.route(graph);
    const first = snapshot.routes.get("first")!,
      second = snapshot.routes.get("second")!;
    expect(first.status).toBe("routed");
    expect(second.status).toBe("routed");
    expect(first.sections.at(-1)!.path.segments.at(-1)!.to).not.toEqual(
      second.sections.at(-1)!.path.segments.at(-1)!.to,
    );
    expect(
      first.sections.filter((s) => s.sharedId).map(({ sharedId, path }) => ({ sharedId, path })),
    ).toEqual(
      second.sections.filter((s) => s.sharedId).map(({ sharedId, path }) => ({ sharedId, path })),
    );
    const moved = createGraph({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "b" ? { ...n, y: n.y! + 30 } : n)),
    });
    expect([...strategy.update(moved, snapshot, getDiff(graph, moved)).snapshot.routes]).toEqual([
      ...strategy.route(moved).routes,
    ]);
  },
);
it.each([busRouting, fanRouting, bundleRouting])(
  "$id keeps named duplicate target ports exact",
  (strategy) => {
    const graph = createGraph({
      id: "fixed-duplicate-ports",
      nodes: [
        { id: "a", x: 20, y: 100, width: 60, height: 60 },
        { id: "b", x: 380, y: 40, width: 60, height: 60, ports: [{ name: "in", x: 0, y: 30 }] },
      ],
      edges: [
        { id: "first", sourceId: "a", targetId: "b", targetPort: "in" },
        { id: "second", sourceId: "a", targetId: "b", targetPort: "in" },
      ],
    });
    for (const route of strategy.route(graph).routes.values())
      expect(route.sections.at(-1)!.path.segments.at(-1)!.to).toEqual({ x: 380, y: 70 });
  },
);
