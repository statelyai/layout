import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import {
  compoundFixture,
  compoundGeometry,
  geometryDifferences,
} from "../scripts/parity/compound-corpus";
for (const seed of [6, 11, 13, 22, 23])
  for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
    it(`retains scanline hitbox bounds (seed ${seed}, ${direction})`, async () => {
      const input = compoundFixture(seed, direction);
      input.layoutOptions = {
        ...input.layoutOptions,
        "elk.layered.compaction.postCompaction.strategy": [
          "LEFT",
          "RIGHT",
          "LEFT_RIGHT_CONSTRAINT_LOCKING",
          "LEFT_RIGHT_CONNECTION_LOCKING",
        ][(seed - 1) % 4]!,
      };
      const actual = await new Native().layout(structuredClone(input));
      const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
