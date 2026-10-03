import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { ancestorNodeCase, ancestorPortCase } from "../scripts/parity/ancestor-port-cases";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const constraints of ["FREE", "FIXED_SIDE", "FIXED_ORDER", "FIXED_POS"]) {
  for (const storage of ["root", "compound"] as const) {
    for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
      for (const side of ["WEST", "EAST", "NORTH", "SOUTH"]) {
        for (const role of ["input", "output"] as const) {
          it(`routes authored compound ports: ${constraints}, ${storage}, ${direction}, ${side}, ${role}`, async () => {
            const input = ancestorPortCase(constraints, storage, direction, side, role);
            const actual = await new NativeELK().layout(structuredClone(input));
            const expected = await new OracleELK().layout(structuredClone(input) as never);
            expect(
              geometryDifferences(compoundGeometry(actual), compoundGeometry(expected)),
            ).toEqual([]);
            expect(actual.children![0]!.layoutOptions).toEqual(input.children![0]!.layoutOptions);
            expect(actual.children![0]!.ports![0]!.layoutOptions).toEqual(
              input.children![0]!.ports![0]!.layoutOptions,
            );
          });
        }
      }
    }
  }
}

for (const constraints of ["FREE", "FIXED_SIDE", "FIXED_ORDER", "FIXED_POS"]) {
  for (const storage of ["root", "compound"] as const) {
    for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
      for (const role of ["input", "output"] as const) {
        it(`routes implicit compound endpoints: ${constraints}, ${storage}, ${direction}, ${role}`, async () => {
          const input = ancestorNodeCase(constraints, storage, direction, role);
          const actual = await new NativeELK().layout(structuredClone(input));
          const expected = await new OracleELK().layout(structuredClone(input) as never);
          expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
            [],
          );
          expect(actual.children![0]!.layoutOptions).toEqual(input.children![0]!.layoutOptions);
          expect(actual.children![0]!.ports).toEqual(input.children![0]!.ports);
        });
      }
    }
  }
}
