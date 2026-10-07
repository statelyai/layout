import { expect, it } from "vitest";
import { JavaRandom } from "../../src/java-random";
import {
  createExternalPortDummy,
  type ExternalPortDummyInput,
} from "../../src/layered/external-port-dummy";
import { elkExternalPortDummy } from "../helpers/elk-constraint-oracle";

it("matches every real ELK external-port factory field on 1,536 seeded boundaries", () => {
  const random = new JavaRandom(3468112780);
  let count = 0;
  for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
    for (const side of ["WEST", "EAST", "NORTH", "SOUTH"] as const)
      for (const constraints of [
        "UNDEFINED",
        "FREE",
        "FIXED_SIDE",
        "FIXED_ORDER",
        "FIXED_RATIO",
        "FIXED_POS",
      ] as const)
        for (let index = 0; index < 16; index++) {
          const input: ExternalPortDummyInput = {
            direction,
            side,
            constraints,
            netFlow: (index % 3) - 1,
            borderOffset: index % 3 === 0 ? -random.nextInt(10) : random.nextInt(10),
            size: { width: random.nextInt(12), height: random.nextInt(12) },
            ownerSize: { width: 30 + random.nextInt(100), height: 30 + random.nextInt(100) },
            position: { x: random.nextInt(50), y: random.nextInt(50) },
            ...(index % 2 ? { anchor: { x: random.nextInt(12), y: random.nextInt(12) } } : {}),
            ...(index % 4 ? { index: random.nextInt(8) } : {}),
          };
          const untouched = structuredClone(input);
          expect(createExternalPortDummy(input), JSON.stringify(input)).toEqual(
            elkExternalPortDummy(input),
          );
          expect(input).toEqual(untouched);
          count++;
        }
  expect(count).toBe(1536);
});
