import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../../src";

it("continues ELK's random stream from cycle breaking into crossing minimization", async () => {
  const nodes = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, width: 30, height: 30 }));
  const edges = [
    [0, 2],
    [1, 2],
    [0, 3],
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 6],
    [5, 6],
    [6, 7],
    [7, 0],
    [7, 1],
    [4, 3],
  ].map(([s, t], i) => ({ id: `e${i}`, sourceId: `n${s}`, targetId: `n${t}` }));
  const settings = {
    randomSeed: 1,
    "crossingMinimization.greedySwitch.type": "OFF",
    "layering.strategy": "LONGEST_PATH_SOURCE",
    edgeRouting: "POLYLINE",
  } as const;
  const run = () => getLayeredLayout(createGraph({ nodes, edges }), { settings });
  const oracle = await new ELK().layout({
    id: "r",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.randomSeed": "1",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.edgeRouting": "POLYLINE",
    },
    children: nodes,
    edges: edges.map((e) => ({ id: e.id, sources: [e.sourceId], targets: [e.targetId] })),
  });
  const order = (ns: ReadonlyArray<{ id: string; x?: number; y?: number }>) => {
    const layers = new Map<number, Array<{ id: string; y: number }>>();
    for (const n of ns) {
      const layer = layers.get(n.x ?? 0) ?? [];
      layer.push({ id: n.id, y: n.y ?? 0 });
      layers.set(n.x ?? 0, layer);
    }
    return [...layers]
      .sort(([a], [b]) => a - b)
      .map(([, ns]) => ns.sort((a, b) => a.y - b.y).map((n) => n.id));
  };
  const first = run();
  expect(order(first.nodes)).toEqual(order(oracle.children ?? []));
  // Reusing options or interleaving another layout must not advance a later run.
  getLayeredLayout(createGraph({ nodes: nodes.slice(0, 3), edges: edges.slice(0, 2) }), {
    settings,
  });
  expect(run()).toEqual(first);
});
