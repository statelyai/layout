import { createGraph } from "@statelyai/graph";
import { getLayeredLayout, routeEdgesOrthogonally } from "../src/layered";
import { expect, it } from "vitest";
for (const direction of ["right", "left", "down", "up"] as const) {
  it(`provides label ports on their declared physical faces to an initial ${direction} router`, () => {
    let examined = 0;
    getLayeredLayout(
      createGraph({
        nodes: [
          { id: "a", width: 30, height: 20 },
          { id: "b", width: 40, height: 30 },
        ],
        edges: [{ id: "edge", sourceId: "a", targetId: "b", label: "edge", width: 24, height: 10 }],
      }),
      {
        direction,
        edgeSettings: () => ({ "edgeLabels.inline": true }),
        strategies: {
          routeEdges: (input, orientation, placement) => {
            for (const node of input.graph.nodes) {
              if (!node.id.startsWith("__layout_dummy:label:")) continue;
              const rect = placement.rectByNodeId.get(node.id)!;
              for (const port of node.ports ?? []) {
                examined++;
                const side = input.portSettings?.(port, node)?.["port.side"];
                expect(["NORTH", "EAST", "SOUTH", "WEST"]).toContain(side);
                if (side === "EAST") expect(port.x).toBeCloseTo(rect.width, 12);
                if (side === "WEST") expect(port.x).toBe(0);
                if (side === "NORTH") expect(port.y).toBe(0);
                if (side === "SOUTH") expect(port.y).toBeCloseTo(rect.height, 12);
                expect(port.x).toBeGreaterThanOrEqual(0);
                expect(port.x).toBeLessThanOrEqual(rect.width);
                expect(port.y).toBeGreaterThanOrEqual(0);
                expect(port.y).toBeLessThanOrEqual(rect.height);
              }
            }
            return routeEdgesOrthogonally(input, orientation, placement);
          },
        },
      },
    );
    expect(examined).toBe(2);
  });
}
