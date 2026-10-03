import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
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
