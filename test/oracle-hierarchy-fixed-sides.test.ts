import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const mode of ["ports", "feedback", "parallel"]) {
  for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
    for (const constraints of [undefined, "FREE", "FIXED_ORDER", "FIXED_POS"]) {
      it(`fixes hierarchy boundary sides: ${mode}, ${direction}, ${constraints ?? "default"}`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.hierarchyHandling": "INCLUDE_CHILDREN",
            "elk.separateConnectedComponents": "false",
          },
          children: [
            {
              id: "g",
              ...(constraints ? { layoutOptions: { "elk.portConstraints": constraints } } : {}),
              children: [
                { id: "a", width: 80, height: 60 },
                { id: "b", width: 80, height: 60 },
              ],
              edges: [{ id: "internal", sources: ["a"], targets: ["b"] }],
            },
            { id: "c", width: 80, height: 60 },
          ],
          edges: [
            { id: "out", sources: ["b"], targets: ["c"] },
            { id: "in", sources: ["c"], targets: ["a"] },
          ],
        };
        const compound = input.children![0]!;
        if (mode === "ports") {
          for (const node of [...compound.children!, input.children![1]!]) {
            node.layoutOptions = { "elk.portConstraints": "FIXED_SIDE" };
            node.ports = ["WEST", "EAST"].map((side) => ({
              id: `${node.id}${side === "WEST" ? "w" : "e"}`,
              width: 4,
              height: 4,
              layoutOptions: { "elk.port.side": side },
            }));
          }
          compound.edges![0]!.sources = ["ae"];
          compound.edges![0]!.targets = ["bw"];
          input.edges![0]!.sources = ["be"];
          input.edges![0]!.targets = ["cw"];
          input.edges![1]!.sources = ["ce"];
          input.edges![1]!.targets = ["aw"];
        }
        if (mode === "parallel") input.edges!.push({ id: "out2", sources: ["b"], targets: ["c"] });
        const authored = structuredClone(input);
        const actual = await new NativeELK().layout(structuredClone(input));
        const expected = await new OracleELK().layout(structuredClone(input) as never);
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
        expect(actual.children![0]!.layoutOptions).toEqual(compound.layoutOptions);
        expect(actual.children![0]!.ports).toEqual(compound.ports);
        expect(input).toEqual(authored);
      });
    }
  }
}
