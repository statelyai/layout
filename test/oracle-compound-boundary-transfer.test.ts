import { expect, it } from "vitest";
import { JavaRandom } from "../src/java-random";
import {
  transferExternalPort,
  type ExternalPortTransfer,
} from "../src/layered/compound-boundaries";
import { elkTransferExternalPort } from "./helpers/elk-constraint-oracle";

it("matches real ELK parent-port and dummy transfer on 1,024 seeded boundaries", () => {
  const random = new JavaRandom(3055430591);
  const positive = () => random.nextDouble() * 100;
  const signed = () => positive() - 50;
  let count = 0;
  for (const side of ["NORTH", "EAST", "SOUTH", "WEST"] as const)
    for (let variant = 0; variant < 256; variant++) {
      const input: ExternalPortTransfer = {
        side,
        contentSize: { width: positive(), height: positive() },
        padding: { left: positive(), right: positive(), top: positive(), bottom: positive() },
        offset: { x: signed(), y: signed() },
        dummy: { x: signed(), y: signed(), width: positive(), height: positive() },
        borderOffset: signed(),
        portSize:
          variant % 4 === 0 ? { width: 0, height: 0 } : { width: positive(), height: positive() },
      };
      const untouched = structuredClone(input);
      expect(transferExternalPort(input), JSON.stringify(input)).toEqual(
        elkTransferExternalPort(input),
      );
      expect(input).toEqual(untouched);
      count++;
    }
  expect(count).toBe(1024);
});
