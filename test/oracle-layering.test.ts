import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getLayeredLayout, type LayeringStrategy } from "../src";

interface Fixture {
  nodes: string[];
  edges: Array<{ id: string; sourceId: string; targetId: string }>;
}

function getLayerRanks(nodes: ReadonlyArray<{ id?: string | number; x?: number }>) {
  const positions = [...new Set(nodes.map((node) => node.x ?? 0))].sort((a, b) => a - b);
  return Object.fromEntries(nodes.map((node) => [String(node.id), positions.indexOf(node.x ?? 0)]));
}

describe("ELK longest-path layering oracle", () => {
  const fixtures: Fixture[] = [
    {
      nodes: ["a", "b", "c", "d"],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "ac", sourceId: "a", targetId: "c" },
        { id: "bd", sourceId: "b", targetId: "d" },
      ],
    },
    {
      nodes: ["a", "b", "c", "d", "e"],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ad", sourceId: "a", targetId: "d" },
        { id: "de", sourceId: "d", targetId: "e" },
      ],
    },
  ];
  const strategies: LayeringStrategy[] = [
    "LONGEST_PATH",
    "LONGEST_PATH_SOURCE",
    "INTERACTIVE",
    "BF_MODEL_ORDER",
    "DF_MODEL_ORDER",
    "COFFMAN_GRAHAM",
    "NETWORK_SIMPLEX",
    "MIN_WIDTH",
    "STRETCH_WIDTH",
  ];

  for (const strategy of strategies) {
    for (const [fixtureIndex, fixture] of fixtures.entries()) {
      it(`matches ${strategy} layer ranks for fixture ${fixtureIndex + 1}`, async () => {
        const elk = new ELK();
        const elkResult = await elk.layout({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.layered.layering.strategy": strategy,
            "elk.separateConnectedComponents": "false",
          },
          children: fixture.nodes.map((id) => ({ id, width: 20, height: 20 })),
          edges: fixture.edges.map((edge) => ({
            id: edge.id,
            sources: [edge.sourceId],
            targets: [edge.targetId],
          })),
        });

        const graph = createGraph({
          nodes: fixture.nodes.map((id) => ({ id, width: 20, height: 20 })),
          edges: fixture.edges,
        });
        const native = getLayeredLayout(graph, {
          direction: "right",
          settings: { "layering.strategy": strategy },
        });

        expect(getLayerRanks(native.nodes)).toEqual(getLayerRanks(elkResult.children ?? []));
      });
    }
  }

  it("matches COFFMAN_GRAHAM with a one-node layer bound", async () => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error("Missing fixture");
    const elk = new ELK();
    const elkResult = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.layering.strategy": "COFFMAN_GRAHAM",
        "elk.layered.layering.coffmanGraham.layerBound": "1",
      },
      children: fixture.nodes.map((id) => ({ id, width: 20, height: 20 })),
      edges: fixture.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
      })),
    });
    const native = getLayeredLayout(
      createGraph({
        nodes: fixture.nodes.map((id) => ({ id, width: 20, height: 20 })),
        edges: fixture.edges,
      }),
      {
        direction: "right",
        settings: {
          "layering.strategy": "COFFMAN_GRAHAM",
          "layering.coffmanGraham.layerBound": 1,
        },
      },
    );

    expect(getLayerRanks(native.nodes)).toEqual(getLayerRanks(elkResult.children ?? []));
  });

  it("matches NETWORK_SIMPLEX over a connected deterministic DAG corpus", async () => {
    let state = 0x5eed;
    const random = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 2 ** 32;
    };
    const elk = new ELK();
    for (let fixtureIndex = 0; fixtureIndex < 16; fixtureIndex++) {
      const nodes = Array.from({ length: 9 }, (_, index) => `n${index}`);
      const edges: Fixture["edges"] = nodes.slice(1).map((targetId, index) => {
        const targetIndex = index + 1;
        const sourceIndex = Math.floor(random() * targetIndex);
        return {
          id: `tree-${sourceIndex}-${targetIndex}`,
          sourceId: nodes[sourceIndex] as string,
          targetId,
        };
      });
      for (let source = 0; source < nodes.length; source++) {
        for (let target = source + 2; target < nodes.length; target++) {
          if (random() < 0.22) {
            edges.push({
              id: `extra-${source}-${target}`,
              sourceId: nodes[source] as string,
              targetId: nodes[target] as string,
            });
          }
        }
      }
      const elkResult = await elk.layout({
        id: `root-${fixtureIndex}`,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        },
        children: nodes.map((id) => ({ id, width: 20, height: 20 })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
        })),
      });
      const native = getLayeredLayout(
        createGraph({
          nodes: nodes.map((id) => ({ id, width: 20, height: 20 })),
          edges,
        }),
        { direction: "right", settings: { "layering.strategy": "NETWORK_SIMPLEX" } },
      );

      expect(getLayerRanks(native.nodes), `fixture ${fixtureIndex}`).toEqual(
        getLayerRanks(elkResult.children ?? []),
      );
    }
  });

  it("matches NETWORK_SIMPLEX shortness priorities", async () => {
    const nodes = Array.from({ length: 7 }, (_, index) => `n${index}`);
    const edges = [
      ["e0-4", "n0", "n4"],
      ["e0-5", "n0", "n5"],
      ["e1-3", "n1", "n3"],
      ["e1-6", "n1", "n6"],
      ["e2-3", "n2", "n3"],
      ["e2-5", "n2", "n5"],
      ["e3-4", "n3", "n4"],
    ].map(([id, sourceId, targetId]) => ({
      id: id as string,
      sourceId: sourceId as string,
      targetId: targetId as string,
    }));
    const elk = new ELK();
    const elkResult = await elk.layout({
      id: "weighted",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      },
      children: nodes.map((id) => ({ id, width: 20, height: 20 })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
        ...(edge.id === "e0-4"
          ? { layoutOptions: { "elk.layered.priority.shortness": "50" } }
          : {}),
      })),
    });
    const native = getLayeredLayout(
      createGraph({
        nodes: nodes.map((id) => ({ id, width: 20, height: 20 })),
        edges,
      }),
      {
        direction: "right",
        settings: { "layering.strategy": "NETWORK_SIMPLEX" },
        edgeSettings: (edge) => ({
          "priority.shortness": edge.id === "e0-4" ? 50 : undefined,
        }),
      },
    );

    expect(getLayerRanks(native.nodes)).toEqual(getLayerRanks(elkResult.children ?? []));
  });

  it("matches every layering strategy over a varied connected DAG corpus", async () => {
    let state = 0xc0ffee;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) >>> 0;
      return state / 2 ** 32;
    };
    const elk = new ELK();
    for (let fixtureIndex = 0; fixtureIndex < 6; fixtureIndex++) {
      const nodes = Array.from({ length: 8 }, (_, index) => ({
        id: `n${index}`,
        width: 20,
        height: 15 + ((index * 17 + fixtureIndex) % 5) * 9,
      }));
      const edges: Fixture["edges"] = nodes.slice(1).map((target, index) => {
        const targetIndex = index + 1;
        const sourceIndex = Math.floor(random() * targetIndex);
        return {
          id: `tree-${sourceIndex}-${targetIndex}`,
          sourceId: nodes[sourceIndex]?.id as string,
          targetId: target.id,
        };
      });
      for (let source = 0; source < nodes.length; source++) {
        for (let target = source + 2; target < nodes.length; target++) {
          if (random() < 0.18) {
            edges.push({
              id: `extra-${source}-${target}`,
              sourceId: nodes[source]?.id as string,
              targetId: nodes[target]?.id as string,
            });
          }
        }
      }

      for (const strategy of strategies) {
        const elkResult = await elk.layout({
          id: `matrix-${fixtureIndex}-${strategy}`,
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.layered.layering.strategy": strategy,
            "elk.separateConnectedComponents": "false",
          },
          children: nodes,
          edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.sourceId],
            targets: [edge.targetId],
          })),
        });
        const native = getLayeredLayout(createGraph({ nodes, edges }), {
          direction: "right",
          settings: { "layering.strategy": strategy },
        });
        expect(getLayerRanks(native.nodes), `${strategy} fixture ${fixtureIndex}`).toEqual(
          getLayerRanks(elkResult.children ?? []),
        );
      }
    }
  });
});
