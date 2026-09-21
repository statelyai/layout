import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { getLayout } from "../src";
import { getFixedLayout } from "../src/fixed";
import {
  executeBuiltInLayout,
  executeElkjs0111Layout,
  executeLayoutAlgorithm,
  getBuiltInLayoutAlgorithm,
} from "../src/internal/layout-engine";
import type { LayoutAlgorithm, LayoutExecutionContext } from "../src/types";

const graph = createGraph({ nodes: [{ id: "a" }], edges: [] });

function context(): LayoutExecutionContext {
  return {
    scope: { mode: "full" },
    diagnostics: [],
    measurePhase(_id, run) {
      return run();
    },
    throwIfAborted() {},
  };
}

describe("shared layout engine", () => {
  it("exposes the same built-in algorithms to both adapters", () => {
    expect(getBuiltInLayoutAlgorithm("layered")?.id).toBe("layered");
    expect(getBuiltInLayoutAlgorithm("unknown")).toBeUndefined();
  });

  it("executes typed built-in requests", async () => {
    const result = await executeBuiltInLayout({ algorithm: "fixed", graph, options: {} });

    expect(result.nodes[0]).toMatchObject({ id: "a", x: 0, y: 0 });
  });

  it("preserves asynchronous custom algorithm execution", async () => {
    const algorithm: LayoutAlgorithm<void> = {
      id: "async-identity",
      capabilities: {
        full: true,
        incremental: false,
        partial: false,
        routeOnly: false,
        hierarchy: false,
        ports: false,
      },
      async layout(input) {
        await Promise.resolve();
        return getFixedLayout(input);
      },
    };
    const direct = await executeLayoutAlgorithm({
      algorithm,
      graph,
      options: undefined,
      context: context(),
    });
    const orchestrated = await getLayout({ graph, algorithm });

    expect(direct.nodes).toEqual(orchestrated.graph.nodes);
  });

  it("isolates pinned ELK quirks from improved native behavior", async () => {
    const edgedGraph = createGraph({
      nodes: [
        { id: "a", width: 30, height: 20 },
        { id: "b", width: 50, height: 40 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    const native = await executeBuiltInLayout({
      algorithm: "random",
      graph: edgedGraph,
      options: { seed: 123 },
    });
    const compatible = await executeElkjs0111Layout({
      algorithm: "random",
      graph: edgedGraph,
      options: { seed: 123 },
    });

    expect(native.nodes).toEqual(compatible.nodes);
    expect(native.edges[0]?.points).not.toEqual(compatible.edges[0]?.points);
  });
});
