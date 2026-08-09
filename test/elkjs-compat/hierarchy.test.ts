/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/test-bug-8.js at tag 0.11.1.
 * Copyright (c) 2021 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

const hierarchicalGraph = {
  id: "root",
  children: [
    {
      id: "A",
      children: [{ id: "a1" }, { id: "a2" }, { id: "$generated_A_initial_0" }],
      edges: [{ id: "a1:0", sources: ["a1"], targets: ["A"] }],
    },
    { id: "$generated_root_initial_0" },
  ],
};

describe("elkjs compatibility: hierarchy", () => {
  it("routes an edge from a child to its compound parent", async () => {
    const elk = new ELK();
    const result = await elk.layout(structuredClone(hierarchicalGraph), {
      layoutOptions: { hierarchyHandling: "INCLUDE_CHILDREN" },
    });

    expect(result.children?.[0]?.edges?.[0]?.sections?.[0]).toMatchObject({
      startPoint: expect.any(Object),
      endPoint: expect.any(Object),
    });
  });

  it("supports primitive edges in hierarchical layout", async () => {
    const elk = new ELK();
    const graph = structuredClone(hierarchicalGraph);
    const compound = graph.children[0];
    if (compound && "edges" in compound) {
      compound.edges = [{ id: "a1:0", source: "a1", target: "A" }] as never;
    }
    const result = await elk.layout(graph, {
      layoutOptions: { hierarchyHandling: "INCLUDE_CHILDREN" },
    });

    expect(result.children?.[0]?.edges?.[0]?.sections).toHaveLength(1);
  });

  it("rejects hierarchical edges when children are laid out separately", async () => {
    const elk = new ELK();

    await expect(
      elk.layout(structuredClone(hierarchicalGraph), {
        layoutOptions: { hierarchyHandling: "SEPARATE_CHILDREN" },
      }),
    ).rejects.toThrow("org.eclipse.elk.core.UnsupportedGraphException");
  });

  it("rejects primitive hierarchical edges when children are laid out separately", async () => {
    const elk = new ELK();
    const graph = structuredClone(hierarchicalGraph);
    const compound = graph.children[0];
    if (compound && "edges" in compound) {
      compound.edges = [{ id: "a1:0", source: "a1", target: "A" }] as never;
    }

    await expect(
      elk.layout(graph, {
        layoutOptions: { hierarchyHandling: "SEPARATE_CHILDREN" },
      }),
    ).rejects.toThrow("org.eclipse.elk.core.UnsupportedGraphException");
  });
});
