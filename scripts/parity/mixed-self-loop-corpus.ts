import type { ElkNode } from "../../src/elkjs/types";

/** Reproducible one-fixed/one-implicit port loops, with bounded node sizes and inset ports. */
export function mixedSelfLoopFixture(seed: number, direction: string): ElkNode {
  let state = seed >>> 0;
  const integer = (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x100000000) * count);
  };
  const width = 40 + integer(141),
    height = 30 + integer(111);
  const side = ["NORTH", "EAST", "SOUTH", "WEST"][integer(4)]!;
  const explicit = integer(2) === 0 ? "source" : "target";
  const crossX = 1 + integer(width - 1),
    crossY = 1 + integer(height - 1);
  return {
    id: "root",
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
    children: [
      {
        id: "a",
        width,
        height,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: [
          {
            id: "p",
            width: 0,
            height: 0,
            x: side === "EAST" ? width : side === "WEST" ? 0 : crossX,
            y: side === "SOUTH" ? height : side === "NORTH" ? 0 : crossY,
            layoutOptions: { "elk.port.side": side },
          },
        ],
      },
    ],
    edges: [
      {
        id: "e",
        sources: [explicit === "source" ? "p" : "a"],
        targets: [explicit === "target" ? "p" : "a"],
      },
    ],
  };
}
