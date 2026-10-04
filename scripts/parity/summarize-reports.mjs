import fs from "node:fs";
import { basename } from "node:path";
import { readReport } from "./read-report.mjs";
const [output, expectedArgument, ...paths] = process.argv.slice(2);
const expectedCases = Number(expectedArgument);
if (!output || !paths.length || !Number.isSafeInteger(expectedCases) || expectedCases < 1)
  throw new Error("Pass output, expected case count and retained report paths");
const summaries = paths.map((path) => {
  const { rows } = readReport(path);
  return {
    name: basename(path),
    cases: rows.length,
    matched: rows.filter((row) => row.equal && row.native?.graph && row.elk?.graph).length,
    differingValues: rows.reduce((sum, row) => sum + row.differences.length, 0),
    nativeErrors: rows.filter((row) => row.native?.error).length,
    elkErrors: rows.filter((row) => row.elk?.error).length,
  };
});
const total = summaries.reduce((result, summary) => {
  for (const key of ["cases", "matched", "differingValues", "nativeErrors", "elkErrors"])
    result[key] = (result[key] ?? 0) + summary[key];
  return result;
}, {});
if (total.cases > expectedCases) throw new Error("Reports exceed expected corpus size");
const report = {
  replayComplete: total.cases === expectedCases,
  parity: total.cases === expectedCases && total.matched === total.cases,
  expectedCases,
  summaries,
  total,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(report);
