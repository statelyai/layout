import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import {
  compoundFixture,
  compoundGeometry,
  geometryDifferences,
} from "../scripts/parity/compound-corpus";

for (const seed of [5, 7, 9])
  for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
    it(`preserves hierarchy crossing orders through placement (seed ${seed}, ${direction})`, async () => {
      const input = compoundFixture(seed, direction);
      const actual = await new Native().layout(structuredClone(input));
      const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
