import type { ElkNode } from "../../src/elkjs/types";

/** Shared backward source ports and forward target ports exercise both exterior channels. */
export function invertedBoundaryFixture(direction: string, count: number, spacing = 10): ElkNode {
  const vertical = direction === "DOWN" || direction === "UP";
  const reverse = direction === "LEFT" || direction === "UP";
  const sourceFace = vertical ? (reverse ? "SOUTH" : "NORTH") : reverse ? "EAST" : "WEST";
  const targetFace = vertical ? (reverse ? "NORTH" : "SOUTH") : reverse ? "WEST" : "EAST";
  const port = (id: string, side: string, cross: number) => ({
    id,
    width: 4,
    height: 4,
    x: side === "WEST" ? -4 : side === "EAST" ? 80 : cross,
    y: side === "NORTH" ? -4 : side === "SOUTH" ? 60 : cross,
    layoutOptions: { "elk.port.side": side },
  });
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.separateConnectedComponents": false,
      "elk.spacing.edgeNodeBetweenLayers": String(spacing),
      "elk.spacing.edgeEdgeBetweenLayers": String(spacing / 2),
    },
    children: [
      {
        id: "a",
        width: 80,
        height: 60,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: [port("a:p", sourceFace, 16)],
      },
      ...Array.from({ length: count }, (_, i) => ({
        id: "b" + i,
        width: 80,
        height: 60,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: [port("b" + i + ":p", targetFace, 32)],
      })),
    ],
    edges: Array.from({ length: count }, (_, i) => ({
      id: "e" + i,
      sources: ["a:p"],
      targets: ["b" + i + ":p"],
    })),
  };
}
