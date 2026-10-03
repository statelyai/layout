import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  it(`selects the physically first parallel port for ${direction} BK alignment`, async () => {
    const horizontal = direction === "RIGHT" || direction === "LEFT";
    const flow = direction === "RIGHT" || direction === "DOWN" ? 89 : -5;
    const side = ({ RIGHT: "EAST", LEFT: "WEST", DOWN: "SOUTH", UP: "NORTH" } as const)[direction];
    const input: ElkNode = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
      children: [
        {
          id: "parent",
          width: 84,
          height: 84,
          layoutOptions: { "elk.portConstraints": "FIXED_POS" },
          ports: [62, 22].map((cross, index) => ({
            id: `p${index}`,
            width: 0,
            height: 0,
            x: horizontal ? flow : cross,
            y: horizontal ? cross : flow,
            layoutOptions: { "elk.port.side": side, "elk.port.borderOffset": 5 },
          })),
        },
        { id: "outside", width: 20, height: 20 },
      ],
      edges: [0, 1].map((index) => ({
        id: `e${index}`,
        sources: [`p${index}`],
        targets: ["outside"],
      })),
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  it(`keeps a shared flexible ${direction} port at one BK anchor`, async () => {
    const side = ({ RIGHT: "EAST", LEFT: "WEST", DOWN: "SOUTH", UP: "NORTH" } as const)[direction];
    const input: ElkNode = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
      children: [
        {
          id: "source",
          width: 84,
          height: 44,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [{ id: "shared", width: 0, height: 0, layoutOptions: { "elk.port.side": side } }],
        },
        { id: "x", width: 20, height: 20 },
        { id: "y", width: 20, height: 20 },
      ],
      edges: ["x", "y"].map((id) => ({ id: `e${id}`, sources: ["shared"], targets: [id] })),
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
