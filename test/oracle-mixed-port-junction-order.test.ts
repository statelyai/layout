import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const [seed, direction] of [
  [2, "RIGHT"],
  [32, "DOWN"],
  [32, "UP"],
] as const) {
  it(`retains physical helper and restored junction order, seed ${seed} ${direction}`, async () => {
    const input = flatFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": false,
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const before of [false, true]) {
    for (const joined of [false, true]) {
      const horizontal = direction === "RIGHT" || direction === "LEFT";
      const side = horizontal ? (before ? "NORTH" : "SOUTH") : before ? "WEST" : "EAST";
      it(`restores mixed ${side} port branches in ${direction} ${joined ? "joined" : "direct"} complete geometry`, async () => {
        const input = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.separateConnectedComponents": false,
          },
          children: (joined ? ["a", "b", "x", "c", "d"] : ["a", "b", "c", "d"]).map((id) => ({
            id,
            width: 80,
            height: 50,
            ...(id === "b" || (joined && id === "c")
              ? {
                  layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
                  ports: [
                    {
                      id: `${id}:p`,
                      width: 4,
                      height: 4,
                      layoutOptions: {
                        "elk.port.side":
                          id === "b"
                            ? side
                            : (
                                { RIGHT: "WEST", LEFT: "EAST", DOWN: "NORTH", UP: "SOUTH" } as const
                              )[direction],
                      },
                    },
                  ],
                }
              : {}),
          })),
          edges: [
            { id: "ab", sources: ["a"], targets: ["b:p"] },
            { id: "bc", sources: ["b:p"], targets: [joined ? "c:p" : "c"] },
            { id: "bd", sources: ["b:p"], targets: ["d"] },
            ...(joined
              ? [
                  { id: "bx", sources: ["b"], targets: ["x"] },
                  { id: "xc", sources: ["x"], targets: ["c:p"] },
                ]
              : []),
          ],
        };
        const actual = await new NativeELK().layout(structuredClone(input));
        const expected = await new OracleELK().layout(structuredClone(input) as never);
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
}
