import { expect, it } from "vitest";
import { JavaRandom } from "../../src/java-random";
import { nativeCrossPortOrder } from "../helpers/native-cross-port-order";
import { elkCrossPortOrder } from "../helpers/elk-constraint-oracle";

it("matches real ELK cross-port layer and associate order for 256 seeded mixed-role port sets", () => {
  const random = new JavaRandom(3468112780);
  for (let i = 0; i < 256; i++) {
    const ports = Array.from({ length: 1 + random.nextInt(8) }, (_, j) => {
      const role = random.nextInt(3);
      return {
        id: "p" + j,
        side: random.nextBoolean() ? ("NORTH" as const) : ("SOUTH" as const),
        x: 10 + j * 10,
        input: role !== 1,
        output: role !== 0,
      };
    });
    const input = { ports };
    expect(nativeCrossPortOrder(input), `case ${i}: ${JSON.stringify(input)}`).toEqual(
      elkCrossPortOrder(input),
    );
  }
});
