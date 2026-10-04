import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "./parity/compound-corpus";
import { mixedSelfLoopFixture } from "./parity/mixed-self-loop-corpus";

const output = resolve(process.argv[2] ?? ".scratch/mixed-self-loop-parity/report.json");
const native = new NativeELK(),
  oracle = new OracleELK();
const rows = [];
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"])
  for (let seed = 1; seed <= 25; seed++) {
    const input = mixedSelfLoopFixture(seed, direction);
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
      seed,
      direction,
      input,
      native: actual,
      elk: expected,
      differences,
      equal: differences.length === 0,
    });
  }
const summary = {
  cases: rows.length,
  matched: rows.filter((r) => r.equal).length,
  nativeErrors: rows.filter((r) => r.native.error).length,
  elkErrors: rows.filter((r) => r.elk.error).length,
  differingValues: rows.reduce((n, r) => n + r.differences.length, 0),
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify({ oracle: "elkjs@0.11.1", tolerance: 5e-13, summary, rows }, null, 2) + "\n",
);
console.log(JSON.stringify({ ...summary, output }));
process.exitCode = summary.matched === summary.cases ? 0 : 1;
