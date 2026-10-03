import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { compoundGeometry } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

for (const strategy of [
  "NONE",
  "LEFT",
  "RIGHT",
  "LEFT_RIGHT_CONSTRAINT_LOCKING",
  "LEFT_RIGHT_CONNECTION_LOCKING",
])
  it(`straightens the shared south-port row using physical incoming adjacency (${strategy})`, async () => {
    const input = flatFixture(22, "RIGHT");
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": strategy,
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    for (const id of ["e0", "e4", "e6", "e7"]) {
      const row = (graph: typeof actual) => {
        const section = graph.edges!.find((edge) => edge.id === id)!.sections![0]!;
        return [
          section.startPoint.y,
          ...(section.bendPoints ?? []).map((point) => point.y),
          section.endPoint.y,
        ];
      };
      // Flow spacing remains covered by the unrelaxed full-geometry random gate.
      expect(row(actual), id).toEqual(row(expected));
    }
  });

for (const strategy of [
  "LEFT",
  "RIGHT",
  "LEFT_RIGHT_CONSTRAINT_LOCKING",
  "LEFT_RIGHT_CONNECTION_LOCKING",
])
  it(`keeps unrelated tracks clear of the fixed loop flow envelope (${strategy})`, async () => {
    const input = flatFixture(22, "RIGHT");
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": strategy,
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    const geometry = (graph: typeof actual) => ({
      width: graph.width,
      height: graph.height,
      nodes: graph.children!.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
      routes: graph.edges!.map(({ id, sections }) => ({ id, sections })),
    });
    expect(geometry(actual)).toEqual(geometry(expected));
    expect(compoundGeometry(actual)).toEqual(compoundGeometry(expected));
  });

it("matches complete geometry for random seed 33 RIGHT with native junctions", async () => {
  const input = flatFixture(33, "RIGHT");
  input.layoutOptions = {
    ...input.layoutOptions,
    "elk.layered.compaction.postCompaction.strategy": "LEFT",
  };
  const actual = await new Native().layout(structuredClone(input));
  const expected = await new Oracle().layout(structuredClone(input) as never);
  expect(compoundGeometry(actual)).toEqual(compoundGeometry(expected));
});
