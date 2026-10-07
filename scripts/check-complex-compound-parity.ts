import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { complexCompoundFixture } from "./parity/complex-compound-corpus";
import { compoundGeometry, geometryDifferences } from "./parity/compound-corpus";

const output = resolve(process.argv[2] ?? ".scratch/complex-compound/report.json");
const first = Number(process.argv[3] ?? 1),
  last = Number(process.argv[4] ?? 25);
if (
  !Number.isSafeInteger(first) ||
  !Number.isSafeInteger(last) ||
  first < 1 ||
  last < first ||
  last > 0xffffffff
)
  throw new Error("Expected an inclusive positive uint32 seed range: [output] [first] [last]");
const native = new NativeELK(),
  oracle = new OracleELK();
const rows = [];
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  for (let seed = first; seed <= last; seed++) {
    const input = complexCompoundFixture(seed, direction);
    const run = async (engine: "native" | "elk") => {
      try {
        const graph =
          engine === "native"
            ? await native.layout(structuredClone(input))
            : ((await oracle.layout(structuredClone(input) as never)) as ElkNode);
        return { graph };
      } catch (error) {
        return { error: String(error) };
      }
    };
    const actual = await run("native"),
      expected = await run("elk");
    const differences =
      actual.graph && expected.graph
        ? geometryDifferences(compoundGeometry(actual.graph), compoundGeometry(expected.graph))
        : [{ path: "$error", actual: actual.error, expected: expected.error }];
    rows.push({
      family: "complex-hierarchy-v1",
      seed,
      direction,
      input,
      native: actual,
      elk: expected,
      differences,
      equal: differences.length === 0,
    });
    console.log(seed, direction, differences.length, actual.error ?? "", expected.error ?? "");
  }
}
const summary = {
  cases: rows.length,
  matched: rows.filter((r) => r.equal).length,
  differingValues: rows.reduce((n, r) => n + r.differences.length, 0),
  nativeErrors: rows.filter((r) => r.native.error).length,
  elkErrors: rows.filter((r) => r.elk.error).length,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      oracle: "elkjs@0.11.1",
      generator: "complex-hierarchy-v1",
      tolerance: 5e-13,
      seedRange: { first, last },
      summary,
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(summary);
process.exitCode = summary.matched === summary.cases ? 0 : 1;
