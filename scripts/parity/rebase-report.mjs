import fs from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { readReport } from "./read-report.mjs";
// Re-express a replayed report as sparse updates over a different retained baseline.
const [replayArgument, baselineArgument, outputArgument] = process.argv.slice(2);
if (!replayArgument || !baselineArgument || !outputArgument)
  throw new Error("Pass a replayed report, a new baseline report and an output path");
const replay = readReport(replayArgument),
  baseline = readReport(baselineArgument),
  output = resolve(outputArgument);
if (replay.rows.length !== baseline.rows.length) throw new Error("Reports differ in size");
const updates = [];
for (const [index, row] of replay.rows.entries()) {
  if (JSON.stringify(row.input) !== JSON.stringify(baseline.rows[index].input))
    throw new Error("Reports differ in inputs");
  if (JSON.stringify(row.native) !== JSON.stringify(baseline.rows[index].native))
    updates.push({ index, row });
}
const rows = replay.rows;
const summary = {
  cases: rows.length,
  matched: rows.filter((row) => row.equal).length,
  differingValues: rows.reduce((sum, row) => sum + row.differences.length, 0),
  nativeErrors: rows.filter((row) => row.native?.error).length,
  elkErrors: rows.filter((row) => row.elk?.error).length,
};
fs.mkdirSync(dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  JSON.stringify(
    { baseline: relative(dirname(output), resolve(baselineArgument)), summary, updates },
    null,
    2,
  ) + "\n",
);
if (JSON.stringify(readReport(output).rows) !== JSON.stringify(rows))
  throw new Error("Rebased report changes rows");
console.log(summary, "updates", updates.length);
