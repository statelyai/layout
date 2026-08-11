import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function compare(input: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(input));
  expect(actual.children?.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
    expected.children?.map(({ id, x, y }) => ({ id, x, y })),
  );
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
}

describe("ELK post-compaction parity", () => {
  for (const strategy of [
    "NONE",
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
    "EDGE_LENGTH",
  ]) {
    for (const constraints of ["SCANLINE", "QUADRATIC"]) {
      it(`matches ${strategy} with ${constraints}`, async () => {
        await compare({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.separateConnectedComponents": "false",
            "elk.layered.compaction.postCompaction.strategy": strategy,
            "elk.layered.compaction.postCompaction.constraints": constraints,
          },
          children: [
            { id: "a", width: 20, height: 20 },
            { id: "b", width: 20, height: 20 },
          ],
          edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
        });
      });
    }
  }

  it("matches leftward compaction of disconnected classes", async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.compaction.postCompaction.strategy": "LEFT",
      },
      children: [0, 1, 2, 3, 4].map((index) => ({
        id: `n${index}`,
        width: 20 + (index % 2) * 10,
        height: 20 + (index % 3) * 10,
      })),
      edges: [{ id: "edge", sources: ["n0"], targets: ["n1"] }],
    };
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    expect(actual.children?.map((node) => node.x)).toEqual(
      expected.children?.map((node) => node.x),
    );
  });
});
