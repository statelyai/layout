import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { ancestorNodeCase, ancestorPortCase } from "./parity/ancestor-port-cases";
import { compoundGeometry, geometryDifferences } from "./parity/compound-corpus";

const output = resolve(process.argv[2] ?? ".scratch/ancestor-port-parity/report.json");
const native = new NativeELK();
const oracle = new OracleELK();
const rows = [];
for (const endpoint of ["port", "node"] as const)
  for (const constraints of ["FREE", "FIXED_SIDE", "FIXED_ORDER", "FIXED_POS"])
    for (const storage of ["root", "compound"] as const)
      for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"])
        for (const side of endpoint === "port" ? ["WEST", "EAST", "NORTH", "SOUTH"] : ["WEST"])
          for (const role of ["input", "output"] as const) {
            const input =
              endpoint === "port"
                ? ancestorPortCase(constraints, storage, direction, side, role)
                : ancestorNodeCase(constraints, storage, direction, role);
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
            const actual = await run("native");
            const expected = await run("elk");
            const differences =
              actual.graph && expected.graph
                ? geometryDifferences(
                    compoundGeometry(actual.graph),
                    compoundGeometry(expected.graph),
                  )
                : [{ path: "$error", actual: actual.error, expected: expected.error }];
            rows.push({
              family: `${endpoint}-${constraints}-${storage}-${side}-${role}`,
              seed: rows.length + 1,
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
  matched: rows.filter((row) => row.equal).length,
  differingValues: rows.reduce((sum, row) => sum + row.differences.length, 0),
  nativeErrors: rows.filter((row) => row.native.error).length,
  elkErrors: rows.filter((row) => row.elk.error).length,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify({ oracle: "elkjs@0.11.1", tolerance: 5e-13, summary, rows }, null, 2) + "\n",
);
console.log(summary);
if (summary.matched !== summary.cases) process.exitCode = 1;
