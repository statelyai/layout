import { expect, it } from "vitest";
import { JavaRandom } from "../../src/java-random";
import {
  countOrthogonalHypersegmentCrossings,
  type OrthogonalPort,
} from "../../src/layered/orthogonal-hypersegments";
import { elkHypersegmentCrossings } from "../helpers/elk-constraint-oracle";
it("matches real ELK shared-port crossing counts on 512 seeded layer boundaries", () => {
  const random = new JavaRandom(3468112780);
  for (let index = 0; index < 512; index++) {
    const count = 2 + random.nextInt(10),
      ports: OrthogonalPort[] = [];
    for (const side of ["source", "target"] as const)
      for (let i = 0; i < count; i++) ports.push({ id: `${side}${i}`, side, position: i });
    const connections: Array<{ source: string; target: string }> = [];
    for (const source of ports.filter((p) => p.side === "source"))
      for (const target of ports.filter((p) => p.side === "target"))
        if (random.nextInt(7) === 0) connections.push({ source: source.id, target: target.id });
    const input = { ports, connections };
    expect(
      countOrthogonalHypersegmentCrossings(ports, connections),
      `case ${index}: ${JSON.stringify(input)}`,
    ).toEqual(elkHypersegmentCrossings(input));
  }
});
