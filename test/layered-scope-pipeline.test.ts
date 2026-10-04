import { createGraph } from "@statelyai/graph";
import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import {
  createLayeredScopePipeline,
  getLayeredLayout,
  placeNodesWithBrandesKoepf,
  routeEdgesOrthogonally,
} from "../src/layered";
import type { ElkNode } from "../src/elkjs/types";
import type { LayeredLayoutOptions } from "../src/layered/types";

const chain = (id: string) =>
  createGraph({
    id,
    nodes: [
      { id: "a", width: 30, height: 20 },
      { id: "b", width: 40, height: 30 },
      { id: "c", width: 20, height: 40 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "bc", sourceId: "b", targetId: "c" },
    ],
  });

for (const direction of ["right", "left", "down", "up"] as const) {
  it(`resumes a prepared ${direction} scope to the real ELK geometry`, async () => {
    const input = chain("root");
    const untouched = structuredClone(input);
    let placements = 0,
      routes = 0;
    const pipeline = createLayeredScopePipeline(input, {
      direction,
      settings: { separateConnectedComponents: false },
      strategies: {
        placeNodes: (input, order) => {
          placements++;
          return placeNodesWithBrandesKoepf(input, order);
        },
        routeEdges: (input, orientation, placement) => {
          routes++;
          return routeEdgesOrthogonally(input, orientation, placement);
        },
      },
    });
    const stage = pipeline.next();
    expect(stage.done).toBe(false);
    expect(placements).toBe(0);
    expect(routes).toBe(0);
    if (stage.done) throw new Error("Expected suspended scope");
    expect([...stage.value.assignment.layerByNodeId.keys()].sort()).toEqual(["a", "b", "c"]);
    const order = stage.value.minimize();
    expect(placements).toBe(0);
    expect(routes).toBe(0);
    const completed = pipeline.next(order);
    expect(completed.done).toBe(true);
    if (!completed.done) throw new Error("Expected completed scope");
    expect(placements).toBe(1);
    expect(routes).toBe(1);
    const actual = completed.value;
    const expected = (await new OracleELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction.toUpperCase(),
        "elk.separateConnectedComponents": "false",
      },
      children: input.nodes.map(({ id, width, height }) => ({ id, width, height })),
      edges: input.edges.map(({ id, sourceId, targetId }) => ({
        id,
        sources: [sourceId],
        targets: [targetId],
      })),
    })) as ElkNode;
    for (const node of expected.children!) {
      const native = actual.nodes.find(({ id }) => id === node.id)!;
      for (const property of ["x", "y", "width", "height"] as const)
        expect(native[property]).toBeCloseTo(node[property]!, 12);
    }
    for (const edge of expected.edges!) {
      const native = actual.edges.find(({ id }) => id === edge.id)!;
      const section = edge.sections![0]!;
      expect(native.points).toEqual([
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]);
    }
    expect(input).toEqual(untouched);
  });
}

it("prepares sibling scopes before either scope reaches placement or routing", () => {
  const placed: string[] = [],
    routed: string[] = [];
  const options: LayeredLayoutOptions = {
    settings: { separateConnectedComponents: false },
    strategies: {
      placeNodes: (input, order) => {
        placed.push(input.graph.id!);
        return placeNodesWithBrandesKoepf(input, order);
      },
      routeEdges: (input, orientation, placement) => {
        routed.push(input.graph.id!);
        return routeEdgesOrthogonally(input, orientation, placement);
      },
    },
  };
  const first = createLayeredScopePipeline(chain("first"), options);
  const second = createLayeredScopePipeline(chain("second"), options);
  const a = first.next(),
    b = second.next();
  expect(a.done).toBe(false);
  expect(b.done).toBe(false);
  if (a.done || b.done) throw new Error("Expected prepared siblings");
  const firstOrder = a.value.minimize(),
    secondOrder = b.value.minimize();
  expect(placed).toEqual([]);
  expect(routed).toEqual([]);
  expect(second.next(secondOrder).done).toBe(true);
  expect(placed).toEqual(["second"]);
  expect(routed).toEqual(["second"]);
  expect(first.next(firstOrder).done).toBe(true);
  expect(placed).toEqual(["second", "first"]);
  expect(routed).toEqual(["second", "first"]);
});

it("resumes with the coordinator's order without rerunning standalone crossing minimization", () => {
  let placed = false;
  const pipeline = createLayeredScopePipeline(chain("root"), {
    settings: { separateConnectedComponents: false },
    strategies: {
      minimizeCrossings: () => {
        throw new Error("Standalone minimizer must not run");
      },
      placeNodes: (input, order) => {
        expect(order.layers).toEqual([["a"], ["b"], ["c"]]);
        placed = true;
        return placeNodesWithBrandesKoepf(input, order);
      },
    },
  });
  const prepared = pipeline.next();
  expect(prepared.done).toBe(false);
  expect(placed).toBe(false);
  const resumed = pipeline.next({ layers: [["a"], ["b"], ["c"]] });
  expect(resumed.done).toBe(true);
  expect(placed).toBe(true);
});

for (const direction of ["right", "left", "down", "up"] as const) {
  it(`refreshes child dimensions before ${direction} placement without mutating authored input`, () => {
    const input = chain("root");
    const untouched = structuredClone(input);
    const options: LayeredLayoutOptions = {
      direction,
      settings: { separateConnectedComponents: false },
    };
    const pipeline = createLayeredScopePipeline(input, options);
    const prepared = pipeline.next();
    if (prepared.done) throw new Error("Expected suspended scope");
    prepared.value.updateNodeSize("a", { width: 90, height: 70 });
    const completed = pipeline.next(prepared.value.minimize());
    if (!completed.done) throw new Error("Expected completed scope");
    const resized = structuredClone(input);
    Object.assign(resized.nodes[0]!, { width: 90, height: 70 });
    const expected = getLayeredLayout(resized, options);
    expect(completed.value.nodes).toEqual(expected.nodes);
    expect(completed.value.edges).toEqual(expected.edges);
    expect(input).toEqual(untouched);
  });
}
