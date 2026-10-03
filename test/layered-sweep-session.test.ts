import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  minimizeHierarchyCrossings,
  type HierarchyCrossingScope,
} from "../src/layered/hierarchy-crossing";
import { JavaRandom } from "../src/java-random";
import { createLayeredScopePipeline } from "../src/layered";
import { createLayerSweepSession } from "../src/layered/strategies";
import type { LayeredPhaseInput } from "../src/layered/types";

const graph = (id: string) =>
  createGraph({
    id,
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, width: 30, height: 20 })),
    edges: [
      { id: "ad", sourceId: "a", targetId: "d" },
      { id: "bc", sourceId: "b", targetId: "c" },
    ],
  });
const input = (id: string): LayeredPhaseInput => ({
  graph: graph(id),
  sizes: new Map(["a", "b", "c", "d"].map((id) => [id, { width: 30, height: 20 }])),
  direction: "right",
  spacing: { node: 20, layer: 20 },
  padding: { top: 12, right: 12, bottom: 12, left: 12 },
  constrainedLayerByNodeId: new Map(),
  settings: {},
});
const assignment = () => ({
  layerByNodeId: new Map([
    ["a", 0],
    ["b", 0],
    ["c", 1],
    ["d", 1],
  ]),
  seedOrder: ["a", "b", "c", "d"],
});
const session = (id: string) =>
  createLayerSweepSession(input(id), { reversedEdgeIds: new Set() }, assignment());

it("restores crossing and port state across competing sweep candidates", () => {
  const sweep = session("root");
  const initial = sweep.snapshot();
  expect(sweep.countCrossings()).toBe(1);
  sweep.sweep(false, true);
  expect(sweep.countCrossings()).toBe(0);
  const selected = sweep.snapshot();
  expect(selected.layers).toEqual([
    ["b", "a"],
    ["c", "d"],
  ]);
  sweep.restore(initial);
  expect(sweep.countCrossings()).toBe(1);
  sweep.restore(selected);
  expect(sweep.countCrossings()).toBe(0);
  expect(sweep.snapshot()).toEqual(selected);
  // Saved candidates must survive later sweeps without sharing arrays or maps.
  sweep.sweep(true, false);
  expect(selected.layers).toEqual([
    ["b", "a"],
    ["c", "d"],
  ]);
  const finished = sweep.finish(selected);
  expect(finished).toEqual(selected);
  expect(finished.layers).not.toBe(selected.layers);
  expect(finished.outputPortOrderByNodeId).not.toBe(selected.outputPortOrderByNodeId);
});

it.each([true, false])("enters a child sweep between parent layers (forward=%s)", (forward) => {
  const parent = session("parent"),
    child = session("child");
  const events: string[] = [];
  const first = forward ? 0 : 1;
  parent.sweep(forward, true, (layer) => {
    events.push(`parent:${layer}`);
    if (layer === first) child.sweep(forward, true, (layer) => events.push(`child:${layer}`));
  });
  expect(events).toEqual(
    forward
      ? ["parent:0", "child:0", "child:1", "parent:1"]
      : ["parent:1", "child:1", "child:0", "parent:0"],
  );
  expect(parent.countCrossings() + child.countCrossings()).toBe(0);
});

it("shares one random stream across recursive scopes", () => {
  const parent = session("parent"),
    child = session("child");
  const stream = new JavaRandom(79),
    expected = stream.clone();
  parent.useRandom(stream);
  child.useRandom(stream);
  parent.shuffleFirstLayer(true);
  child.shuffleFirstLayer(false);
  // Two first layers each contain two nodes, consuming four tie-break values.
  for (let i = 0; i < 4; i++) expected.nextDouble();
  expect(parent.random).toBe(child.random);
  expect(stream.nextLong()).toBe(expected.nextLong());
});

it("resumes placement and routing from an externally minimized scope", () => {
  const standalone = createLayeredScopePipeline(graph("root"), {
    settings: { separateConnectedComponents: false },
  });
  const first = standalone.next();
  if (first.done) throw new Error("Expected prepared scope");
  const expected = standalone.next(first.value.minimize());
  expect(expected.done).toBe(true);

  const coordinated = createLayeredScopePipeline(graph("root"), {
    settings: { separateConnectedComponents: false },
  });
  const prepared = coordinated.next();
  if (prepared.done) throw new Error("Expected prepared scope");
  const sweep = createLayerSweepSession(
    prepared.value.input,
    prepared.value.orientation,
    prepared.value.assignment,
  );
  const selected = sweep.minimize();
  expect(sweep.snapshot()).toEqual(selected);
  const actual = coordinated.next(selected);
  expect(actual.done).toBe(true);
  expect(actual.value).toEqual(expected.value);
});

it.each([false, true])("retains coupled scope orders with bottomUp=%s", (bottomUp) => {
  const parentSession = session("parent"),
    childSession = session("child");
  const events: string[] = [];
  const observe = (name: string, target: typeof parentSession) => {
    const sweep = target.sweep;
    target.sweep = (...args) => {
      events.push(`${name}:enter`);
      sweep(...args);
      events.push(`${name}:exit`);
    };
  };
  observe("parent", parentSession);
  observe("child", childSession);
  const child: HierarchyCrossingScope = {
    session: childSession,
    childrenByNodeId: new Map(),
    useBottomUp: bottomUp,
    publishBottomUp: () => events.push("child:publish"),
  };
  const parent: HierarchyCrossingScope = {
    session: parentSession,
    childrenByNodeId: new Map([["a", child]]),
    useBottomUp: true,
  };
  const result = minimizeHierarchyCrossings(parent);
  expect(result.size).toBe(2);
  expect(parentSession.countCrossings() + childSession.countCrossings()).toBe(0);
  expect(parentSession.snapshot()).toEqual(result.get(parent));
  expect(childSession.snapshot()).toEqual(result.get(child));
  const parentStart = events.indexOf("parent:enter"),
    parentEnd = events.indexOf("parent:exit");
  const childStart = events.indexOf("child:enter"),
    childEnd = events.indexOf("child:exit");
  if (bottomUp) {
    expect(childEnd).toBeLessThan(parentStart);
    expect(events.indexOf("child:publish")).toBeLessThan(parentStart);
  } else {
    expect(childStart).toBeGreaterThan(parentStart);
    expect(childEnd).toBeLessThan(parentEnd);
    expect(events).not.toContain("child:publish");
  }
});

it("restores constrained nodes before appending long-edge sweep dummies", () => {
  const graph = createGraph({
    id: "constraint-before-split",
    nodes: ["a", "b", "c", "last", "boundary"].map((id) => ({
      id,
      width: 30,
      height: 20,
    })),
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "bc", sourceId: "b", targetId: "c" },
      { id: "across", sourceId: "a", targetId: "boundary" },
    ],
  });
  const pipeline = createLayeredScopePipeline(graph, {
    settings: { separateConnectedComponents: false },
    nodeSettings: (node) =>
      node.id === "last"
        ? { "layering.layerConstraint": "LAST" }
        : node.id === "boundary"
          ? { "layering.layerConstraint": "LAST_SEPARATE" }
          : undefined,
  });
  const prepared = pipeline.next();
  if (prepared.done) throw new Error("Expected prepared scope");
  const sweep = createLayerSweepSession(
    prepared.value.input,
    prepared.value.orientation,
    prepared.value.assignment,
  );
  const layer = sweep.snapshot().layers.find((layer) => layer.includes("last"))!;
  expect(layer).toContain("c");
  const dummy = layer.find((id) => id.startsWith("__layout_dummy:across:"));
  expect(dummy).toBeDefined();
  expect(layer.indexOf("last")).toBeLessThan(layer.indexOf(dummy!));
});
