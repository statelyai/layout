import { createGraph, getDiff } from "@statelyai/graph";
import type { NativeRoutingStrategy, RoutingGraph, RoutingSettings } from "../src/routing";

export interface RoutingFixture {
  readonly name: string;
  readonly graph: RoutingGraph;
  readonly settings: RoutingSettings;
  readonly movedNode: string;
  readonly strategy: NativeRoutingStrategy["id"];
}

export function sparseRoutingFixture(size: number, customSettings = false): RoutingFixture {
  return {
    name: `${customSettings ? "configured" : "sparse"}-${size}`,
    graph: createGraph({
      id: `sparse-${size}`,
      nodes: Array.from({ length: size }, (_, i) => [
        { id: `a${i}`, x: 0, y: i * 200, width: 40, height: 40 },
        { id: `b${i}`, x: 300, y: i * 200, width: 40, height: 40 },
      ]).flat(),
      edges: Array.from({ length: size }, (_, i) => ({
        id: `edge${i}`,
        sourceId: `a${i}`,
        targetId: `b${i}`,
      })),
    }),
    settings: customSettings
      ? {
          edges: Object.fromEntries(
            Array.from({ length: size }, (_, i) => [
              `edge${i}`,
              { sourceSide: "right", targetSide: "left" },
            ]),
          ),
        }
      : {},
    movedNode: `a${Math.floor(size / 2)}`,
    strategy: "orthogonal",
  };
}

export function routingFixtures(sizes: readonly number[]): RoutingFixture[] {
  const fanSize = 16;
  return [
    ...sizes.flatMap((size) => [sparseRoutingFixture(size), sparseRoutingFixture(size, true)]),
    {
      name: "obstacle-corridors-24",
      graph: createGraph({
        id: "corridors",
        nodes: Array.from({ length: 24 }, (_, i) => [
          { id: `a${i}`, x: 0, y: i * 120, width: 40, height: 40 },
          { id: `b${i}`, x: 300, y: i * 120, width: 40, height: 40 },
          { id: `block${i}`, x: 130, y: i * 120 - 10, width: 40, height: 60 },
        ]).flat(),
        edges: Array.from({ length: 24 }, (_, i) => ({
          id: `edge${i}`,
          sourceId: `a${i}`,
          targetId: `b${i}`,
        })),
      }),
      settings: {},
      movedNode: "block12",
      strategy: "orthogonal",
    },
    {
      name: "high-degree-16",
      graph: createGraph({
        id: "fanout",
        nodes: [
          { id: "source", x: 0, y: 0, width: 60, height: fanSize * 40 },
          ...Array.from({ length: fanSize }, (_, i) => ({
            id: `target${i}`,
            x: 400,
            y: i * 100,
            width: 40,
            height: 40,
          })),
        ],
        edges: Array.from({ length: fanSize }, (_, i) => ({
          id: `edge${i}`,
          sourceId: "source",
          targetId: `target${i}`,
        })),
      }),
      settings: { crossingPenalty: 0, overlapPenalty: 0 },
      movedNode: "source",
      strategy: "orthogonal",
    },
    {
      name: "compound-parent-8",
      graph: createGraph({
        id: "compound",
        nodes: [
          { id: "parent", x: 0, y: 0, width: 180, height: 900 },
          ...Array.from({ length: 8 }, (_, i) => [
            { id: `a${i}`, parentId: "parent", x: 40, y: i * 100 + 30, width: 40, height: 40 },
            { id: `b${i}`, x: 400, y: i * 100 + 30, width: 40, height: 40 },
          ]).flat(),
        ],
        edges: Array.from({ length: 8 }, (_, i) => ({
          id: `edge${i}`,
          sourceId: `a${i}`,
          targetId: `b${i}`,
        })),
      }),
      settings: {},
      movedNode: "parent",
      strategy: "orthogonal",
    },
  ];
}

/** Resolve edits outside timing. The router receives the operation's delta directly. */
export function routingDragFrames(fixture: RoutingFixture, count: number) {
  const moved = fixture.graph.nodes.find((node) => node.id === fixture.movedNode);
  if (!moved || moved.x === undefined || moved.y === undefined)
    throw new Error("Missing drag geometry");
  let previous = fixture.graph;
  return Array.from({ length: count }, (_, frame) => {
    const graph = {
      ...fixture.graph,
      nodes: fixture.graph.nodes.map((node) =>
        node.id === fixture.movedNode
          ? {
              ...node,
              x: moved.x! + ((frame + 1) % 32),
              y: moved.y! + Math.sin((frame + 1) / 8) * 12,
            }
          : node,
      ),
    };
    const diff = getDiff(previous, graph);
    previous = graph;
    return { graph, diff };
  });
}
