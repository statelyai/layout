import fs from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { readReport } from "./read-report.mjs";
// Re-serialize retained evidence at a new location without rerunning either engine.
const [sourceArgument, outputArgument, replacementBaselineArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) throw new Error("Pass source report and destination");
const source = resolve(sourceArgument),
  output = resolve(outputArgument);
const raw = JSON.parse(fs.readFileSync(source, "utf8"));
const original = readReport(source);
if (replacementBaselineArgument) {
  if (typeof raw.baseline !== "string")
    throw new Error("Only sparse reports can replace a baseline");
  const oldBase = readReport(resolve(dirname(source), raw.baseline));
  const newBase = readReport(replacementBaselineArgument);
  if (JSON.stringify(oldBase.rows) !== JSON.stringify(newBase.rows))
    throw new Error("Replacement baseline changes retained rows");
}
const archived =
  typeof raw.baseline === "string"
    ? {
        ...raw,
        baseline: relative(
          dirname(output),
          replacementBaselineArgument
            ? resolve(replacementBaselineArgument)
            : resolve(dirname(source), raw.baseline),
        ),
      }
    : raw;
fs.mkdirSync(dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(archived, null, 2) + "\n");
if (JSON.stringify(readReport(output).rows) !== JSON.stringify(original.rows))
  throw new Error("Archived report changes retained rows");
console.log(`Preserved ${original.rows.length} rows`);
