import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "./parity/read-report.mjs";
import {
  compoundGeometry,
  geometryDifferences,
  type GeometryDifference,
} from "./parity/compound-corpus";

const [baselineArgument, outputArgument] = process.argv.slice(2);
if (!baselineArgument || !outputArgument)
  throw new Error("Pass a frozen ELK report and an output path");
const baseline = resolve(baselineArgument),
  output = resolve(outputArgument);
interface FrozenRow {
  input: ElkNode;
  native: { graph?: ElkNode; error?: string };
  elk: { graph?: ElkNode; error?: string };
  seed: number;
  direction: string;
  differences: GeometryDifference[];
  equal: boolean;
}
const previous = readReport(baseline) as { rows: FrozenRow[] },
  engine = new NativeELK();
const rows = [];
const updates = [];
const delta = [];
for (let index = 0; index < previous.rows.length; index++) {
  const old = previous.rows[index];
  let native: { graph?: ElkNode; error?: string };
  try {
    native = { graph: await engine.layout(structuredClone(old.input)) };
  } catch (error) {
    native = { error: String(error) };
  }
  const differences =
    native.graph && old.elk.graph
      ? geometryDifferences(compoundGeometry(native.graph), compoundGeometry(old.elk.graph))
      : [{ path: "$error", actual: native.error, expected: old.elk.error }];
  const row = { ...old, native, differences, equal: differences.length === 0 };
  rows.push(row);
  if (JSON.stringify(native) !== JSON.stringify(old.native)) {
    updates.push({ index, row });
    delta.push({
      index,
      seed: row.seed,
      direction: row.direction,
      before: old.differences.length,
      after: differences.length,
      lost: old.equal && !row.equal,
      gained: !old.equal && row.equal,
      nativeError: native.error,
    });
  }
  if (index % 20 === 0) console.log(index, "/", previous.rows.length);
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
  JSON.stringify({ baseline: relative(dirname(output), baseline), summary, updates }, null, 2) +
    "\n",
);
writeFileSync(
  output.replace(/\.json$/, ".delta.json"),
  JSON.stringify({ summary, changed: updates.length, delta }, null, 2) + "\n",
);
console.log(summary);
if (rows.some((row) => !row.equal)) process.exitCode = 1;
