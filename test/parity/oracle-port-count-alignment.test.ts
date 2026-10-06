import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";

for (const direction of ["RIGHT", "DOWN", "LEFT", "UP"] as const) {
  it(`aligns a node by connected ports, not shared-port edge multiplicity (${direction})`, async () => {
    const forward = { RIGHT: "EAST", DOWN: "SOUTH", LEFT: "WEST", UP: "NORTH" }[direction];
    const backward = { RIGHT: "WEST", DOWN: "NORTH", LEFT: "EAST", UP: "SOUTH" }[direction];
    const horizontal = direction === "RIGHT" || direction === "LEFT";
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      },
      children: [
        { id: "s", width: 20, height: 20 },
        { id: "big", width: horizontal ? 40 : 20, height: horizontal ? 20 : 40 },
        {
          id: "small",
          width: 10,
          height: 10,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            { id: "small-in", width: 0, height: 0, layoutOptions: { "elk.port.side": backward } },
            { id: "small-out", width: 0, height: 0, layoutOptions: { "elk.port.side": forward } },
          ],
        },
        { id: "t", width: 20, height: 20 },
      ],
      edges: [
        { id: "s-big", sources: ["s"], targets: ["big"] },
        { id: "s-small", sources: ["s"], targets: ["small-in"] },
        { id: "big-t", sources: ["big"], targets: ["t"] },
        ...[0, 1, 2].map((index) => ({
          id: `small-t-${index}`,
          sources: ["small-out"],
          targets: ["t"],
        })),
      ],
    };
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    const flow = horizontal ? "x" : "y";
    const expectedSmall = expected.children?.find((n) => n.id === "small");
    const actualSmall = actual.children?.find((n) => n.id === "small");
    expect(actualSmall?.[flow]).toBeCloseTo(expectedSmall?.[flow] ?? Number.NaN, 12);
    const expectedBig = expected.children?.find((n) => n.id === "big");
    const actualBig = actual.children?.find((n) => n.id === "big");
    expect(actualBig?.[flow]).toBeCloseTo(expectedBig?.[flow] ?? Number.NaN, 12);
  });
}
