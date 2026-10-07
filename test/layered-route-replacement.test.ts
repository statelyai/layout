import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout, getLayout } from "../src";
import { getLayoutRoutes, straightRouting, bezierRouting } from "../src/routing";

const input = () =>
  createGraph({
    nodes: [
      { id: "g" },
      { id: "a", parentId: "g", width: 80, height: 40 },
      { id: "b", parentId: "g", width: 80, height: 40 },
      { id: "c", width: 80, height: 40 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", width: 50, height: 20 },
      { id: "bc", sourceId: "b", targetId: "c" },
    ],
  });

it("replaces initial routes without changing node or label placement", () => {
  const graph = input();
  const initial = getLayeredLayout(graph);
  let called = 0;
  const replaced = getLayeredLayout(graph, {
    routing: {
      strategy: {
        route(routed, settings) {
          called++;
          expect(settings?.coordinateSpace).toBe("world");
          const g = initial.nodes.find((n) => n.id === "g")!,
            a = initial.nodes.find((n) => n.id === "a")!;
          expect(routed.nodes.find((n) => n.id === "a")).toMatchObject({
            x: g.x + a.x,
            y: g.y + a.y,
          });
          expect(routed.edges.every((e) => e.points === undefined)).toBe(true);
          expect((routed as { compoundRoutes?: unknown }).compoundRoutes).toBeUndefined();
          return bezierRouting.route(routed, settings);
        },
      },
    },
  });
  expect(called).toBe(1);
  expect(replaced.nodes).toEqual(initial.nodes);
  expect(replaced.compoundGeometry).toEqual(initial.compoundGeometry);
  expect(replaced.edges.map(({ points: _points, routing: _routing, ...e }) => e)).toEqual(
    initial.edges.map(({ points: _points, routing: _routing, ...e }) => e),
  );
  expect([...getLayoutRoutes(replaced)]).not.toEqual([...getLayoutRoutes(initial)]);
  expect(graph).toEqual(input());
});
it("uses the same foundation and replacement through getLayout", async () => {
  const options = { routing: { strategy: straightRouting } };
  const direct = getLayeredLayout(input(), options);
  const result = await getLayout({ graph: input(), algorithm: "layered", options });
  expect(result.graph).toEqual(direct);
  expect([...getLayoutRoutes(result.graph)]).toEqual([...getLayoutRoutes(direct)]);
});

it("rejects incomplete replacement routes", () => {
  expect(() =>
    getLayeredLayout(input(), {
      routing: {
        strategy: {
          route(graph, settings) {
            const snapshot = straightRouting.route(graph, settings);
            return { ...snapshot, routes: new Map() };
          },
        },
      },
    }),
  ).toThrow("exactly one route for every edge");
});
it("rejects replacement routing for scoped layout instead of silently ignoring it", async () => {
  await expect(
    getLayout({
      graph: input(),
      algorithm: "layered",
      scope: { mode: "route-only", previous: getLayeredLayout(input()), edgeIds: ["ab"] },
      options: { routing: { strategy: straightRouting } },
    }),
  ).rejects.toThrow("requires unconstrained full layout");
});
