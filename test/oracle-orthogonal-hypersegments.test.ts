import { expect, it } from "vitest";
import { JavaRandom } from "../src/java-random";
import {
  createOrthogonalHypersegments,
  type OrthogonalPort,
} from "../src/layered/orthogonal-hypersegments";
import { elkOrthogonalHypersegments } from "./helpers/elk-constraint-oracle";
it("matches ELK connected shared-port creation, traversal and coordinate order on 512 seeded boundaries", () => {
  const random = new JavaRandom(3468112780);
  for (let index = 0; index < 512; index++) {
    const ports: OrthogonalPort[] = Array.from({ length: 2 + random.nextInt(10) }, (_, i) => ({
      id: `p${i}`,
      side: i % 2 ? "target" : "source",
      position: (random.nextInt(30) - 10) / 3,
    }));
    const connections: Array<{ source: string; target: string }> = [];
    for (const source of ports.filter((p) => p.side === "source"))
      for (const target of ports.filter((p) => p.side === "target"))
        if (random.nextInt(4) === 0) {
          const backward = random.nextBoolean();
          connections.push({
            source: backward ? target.id : source.id,
            target: backward ? source.id : target.id,
          });
        }
    const input = { ports, connections };
    expect(
      createOrthogonalHypersegments(ports, connections),
      `case ${index}: ${JSON.stringify(input)}`,
    ).toEqual(elkOrthogonalHypersegments(input));
  }
});
