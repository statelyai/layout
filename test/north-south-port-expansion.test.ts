import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  insertNorthSouthPortDummies,
  restoreNorthSouthPortRoutes,
} from "../src/layered/north-south-ports";
import { splitLongEdges } from "../src/layered/long-edges";
import { crossingRandom, recordCycleRandom } from "../src/layered/cycle-random";
import { JavaRandom } from "../src/java-random";
import type { LayeredPhaseInput } from "../src/layered/types";
for (const direction of ["right", "left", "down", "up"] as const) {
  for (const reversed of [false, true]) {
    it(`detaches shared cross ports into same-layer units in ${direction}, reversed=${reversed}`, () => {
      const vertical = direction === "down" || direction === "up";
      const graph = createGraph({
        nodes: [
          {
            id: "a",
            ports: [{ name: "cross", direction: "out", x: 15, y: 0, width: 0, height: 0 }],
          },
          {
            id: "b",
            ports: [{ name: "cross", direction: "in", x: 20, y: 30, width: 0, height: 0 }],
          },
          { id: "c" },
        ],
        edges: [
          { id: "ab", sourceId: "a", sourcePort: "cross", targetId: "b", targetPort: "cross" },
          { id: "ac", sourceId: "a", sourcePort: "cross", targetId: "c" },
        ],
      });
      const input: LayeredPhaseInput = {
        graph,
        sizes: new Map(),
        direction,
        settings: {},
        constrainedLayerByNodeId: new Map(),
        spacing: { node: 20, layer: 20 },
        padding: { top: 12, right: 12, left: 12, bottom: 12 },
        nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
        portSettings: (_, n) => ({
          "port.side": vertical
            ? n.id === "a"
              ? "WEST"
              : "EAST"
            : n.id === "a"
              ? "NORTH"
              : "SOUTH",
        }),
      };
      const random = new JavaRandom(123);
      random.nextDouble();
      recordCycleRandom(input, random);
      const before = structuredClone(graph);
      const original = splitLongEdges(
        input,
        { reversedEdgeIds: new Set(reversed ? ["ab", "ac"] : []) },
        {
          layerByNodeId: new Map([
            ["a", reversed ? 1 : 0],
            ["b", reversed ? 0 : 1],
            ["c", reversed ? 0 : 1],
          ]),
        },
      );
      const result = insertNorthSouthPortDummies(original),
        expanded = result.expansion;
      const origins = [...result.originsByDummyId];
      expect(origins).toHaveLength(2);
      const a = origins.find(([, o]) => o.node.id === "a")![0],
        b = origins.find(([, o]) => o.node.id === "b")![0];
      expect(expanded.assignment.layerByNodeId.get(a)).toBe(reversed ? 1 : 0);
      expect(expanded.assignment.layerByNodeId.get(b)).toBe(reversed ? 0 : 1);
      expect(expanded.input.graph.edges[0]!.sourceId).toBe(a);
      expect(expanded.input.graph.edges[1]!.sourceId).toBe(a);
      expect(expanded.input.graph.edges[0]!.targetId).toBe(b);
      expect(expanded.input.graph.edges[0]!.sourcePort).toBe(reversed ? "input" : "output");
      expect(expanded.input.graph.edges[0]!.targetPort).toBe(reversed ? "output" : "input");
      expect(result.successorsByNodeId.get(a)).toEqual(["a"]);
      expect(result.successorsByNodeId.get("b")).toEqual([b]);
      expect(result.layoutUnitByNodeId.get(a)).toBe("a");
      expect(expanded.assignment.seedOrder).toEqual([a, "a", "b", b, "c"]);
      expect(crossingRandom(expanded.input).nextDouble()).toBe(crossingRandom(input).nextDouble());
      expect(expanded.segmentIdsByEdgeId).toBe(original.segmentIdsByEdgeId);
      expect(expanded.orientation).toBe(original.orientation);
      const placement = {
        rectByNodeId: new Map([
          [a, { x: 12, y: 12, width: 0, height: 0 }],
          [b, { x: 80, y: 12, width: 0, height: 0 }],
        ]),
      };
      const route = vertical
        ? [
            { x: 12, y: 30 },
            { x: 80, y: 30 },
          ]
        : [
            { x: 30, y: 12 },
            { x: 80, y: 12 },
          ];
      const routes = { pointsByEdgeId: new Map([["ab", route]]) };
      const sourceAnchor = vertical ? { x: 32, y: 30 } : { x: 30, y: 32 };
      const targetAnchor = vertical ? { x: 60, y: 30 } : { x: 80, y: 0 };
      const restored = restoreNorthSouthPortRoutes(result, placement, routes, (o) =>
        o.node.id === "a" ? sourceAnchor : targetAnchor,
      );
      const points = restored.pointsByEdgeId.get("ab")!;
      expect(points[0]).toEqual(sourceAnchor);
      expect(points.at(-1)).toEqual(targetAnchor);
      expect(points).toHaveLength(4);
      for (let i = 1; i < points.length; i++)
        expect(points[i]!.x === points[i - 1]!.x || points[i]!.y === points[i - 1]!.y).toBe(true);
      expect(routes.pointsByEdgeId.get("ab")).toBe(route);
      // The router can collapse distinct coincident endpoints to one point.
      // Restoration must keep the opposite endpoint while reconnecting either face.
      const shared = { x: 12, y: 12 };
      const coincidentPlacement = { rectByNodeId: new Map(placement.rectByNodeId) };
      coincidentPlacement.rectByNodeId.set(b, { x: 12, y: 12, width: 0, height: 0 });
      const collapsed = {
        pointsByEdgeId: new Map([
          ["ab", [shared]],
          ["ac", [shared]],
        ]),
      };
      const restoredCollapsed = restoreNorthSouthPortRoutes(
        result,
        coincidentPlacement,
        collapsed,
        (o) => (o.node.id === "a" ? sourceAnchor : targetAnchor),
      );
      expect(restoredCollapsed.pointsByEdgeId.get("ab")).toEqual([
        sourceAnchor,
        vertical ? { x: 12, y: sourceAnchor.y } : { x: sourceAnchor.x, y: 12 },
        vertical ? { x: 12, y: targetAnchor.y } : { x: targetAnchor.x, y: 12 },
        targetAnchor,
      ]);
      expect(restoredCollapsed.pointsByEdgeId.get("ac")).toEqual([
        sourceAnchor,
        vertical ? { x: 12, y: sourceAnchor.y } : { x: sourceAnchor.x, y: 12 },
        shared,
      ]);
      expect(collapsed.pointsByEdgeId.get("ab")).toEqual([shared]);
      expect(collapsed.pointsByEdgeId.get("ac")).toEqual([shared]);
      expect(graph).toEqual(before);
    });
  }
}
it("keeps FREE ports and self-loop graphs for their dedicated phases", () => {
  const graph = createGraph({
    nodes: [{ id: "a", ports: [{ name: "p", direction: "out" }] }],
    edges: [{ id: "loop", sourceId: "a", targetId: "a", sourcePort: "p", targetPort: "p" }],
  });
  const input: LayeredPhaseInput = {
    graph,
    sizes: new Map(),
    direction: "right",
    settings: {},
    constrainedLayerByNodeId: new Map(),
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, right: 12, left: 12, bottom: 12 },
    nodeSettings: () => ({ portConstraints: "FREE" }),
    portSettings: () => ({ "port.side": "NORTH" }),
  };
  const original = splitLongEdges(
    input,
    { reversedEdgeIds: new Set() },
    { layerByNodeId: new Map([["a", 0]]) },
  );
  expect(insertNorthSouthPortDummies(original).expansion).toBe(original);
});

it("shares a mixed-role port, reserves unique IDs, and honors switch-side permissions", () => {
  const collision = "__layout_dummy:north-south:a:p";
  const graph = createGraph({
    nodes: [
      { id: "a", ports: [{ name: "p", direction: "inout", width: 0, height: 0 }] },
      { id: "b" },
      { id: "c" },
      { id: collision },
    ],
    edges: [
      { id: "ab", sourceId: "a", sourcePort: "p", targetId: "b" },
      { id: "ac", sourceId: "a", sourcePort: "p", targetId: "c" },
    ],
  });
  const input: LayeredPhaseInput = {
    graph,
    sizes: new Map(),
    direction: "right",
    settings: {},
    constrainedLayerByNodeId: new Map(),
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, right: 12, left: 12, bottom: 12 },
    nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
    portSettings: () => ({ "port.side": "NORTH", allowNonFlowPortsToSwitchSides: true }),
  };
  const original = splitLongEdges(
    input,
    { reversedEdgeIds: new Set(["ac"]) },
    {
      layerByNodeId: new Map([
        ["a", 0],
        ["b", 1],
        ["c", 1],
        [collision, 0],
      ]),
    },
  );
  const result = insertNorthSouthPortDummies(original);
  expect(result.originsByDummyId.size).toBe(1);
  const [id, origin] = [...result.originsByDummyId][0]!;
  expect(id).not.toBe(collision);
  expect(origin.input).toBe(true);
  expect(origin.output).toBe(true);
  expect(
    result.expansion.input.graph.nodes.find((n) => n.id === id)!.ports!.map((p) => p.name),
  ).toEqual(["input", "output"]);
  expect(result.successorsByNodeId.size).toBe(0);
  expect(result.expansion.input.graph.nodes.find((n) => n.id === collision)).toBe(
    original.input.graph.nodes.find((n) => n.id === collision),
  );
});

it("preserves route identity when there are no cross-port endpoints", () => {
  const graph = createGraph({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });
  const input: LayeredPhaseInput = {
    graph,
    sizes: new Map(),
    direction: "right",
    settings: {},
    constrainedLayerByNodeId: new Map(),
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, right: 12, left: 12, bottom: 12 },
  };
  const phase = insertNorthSouthPortDummies(
    splitLongEdges(
      input,
      { reversedEdgeIds: new Set() },
      {
        layerByNodeId: new Map([
          ["a", 0],
          ["b", 1],
        ]),
      },
    ),
  );
  const routes = {
    pointsByEdgeId: new Map([
      [
        "ab",
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      ],
    ]),
  };
  expect(
    restoreNorthSouthPortRoutes(phase, { rectByNodeId: new Map() }, routes, () => {
      throw new Error("unexpected anchor call");
    }),
  ).toBe(routes);
});
