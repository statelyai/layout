// Generate a quality holdout: the five parity generators' inputs and real-ELK
// output for an inclusive seed range, trimmed to what the quality gate reads.
// Usage: tsx scripts/parity/generate-quality-holdout.ts <output-dir> <firstSeed> <lastSeed>
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const [outputArgument, firstArgument, lastArgument] = process.argv.slice(2);
const first = Number(firstArgument),
  last = Number(lastArgument);
if (!outputArgument || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last < first)
  throw new Error("Usage: generate-quality-holdout.ts <output-dir> <firstSeed> <lastSeed>");
const output = resolve(outputArgument);
const generators = [
  "flat",
  "model-order",
  "directional-compaction",
  "compound-options",
  "complex-compound",
] as const;
const scratch = fs.mkdtempSync(join(os.tmpdir(), "quality-holdout-"));

const run = (generator: string, report: string) =>
  new Promise<void>((done, fail) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", `scripts/check-${generator}-parity.ts`, report, String(first), String(last)],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    // The parity checks exit 1 when native and ELK geometry differ; only the report matters.
    child.on("exit", () =>
      fs.existsSync(report) ? done() : fail(new Error(`${generator} wrote no report`)),
    );
  });

fs.mkdirSync(output, { recursive: true });
await Promise.all(
  generators.map(async (generator) => {
    const report = join(scratch, `${generator}.json`);
    await run(generator, report);
    const { rows } = JSON.parse(fs.readFileSync(report, "utf8")) as {
      rows: Array<Record<string, unknown>>;
    };
    const trimmed = rows.map(
      ({ native: _native, differences: _differences, equal: _equal, ...row }) =>
        generator === "flat" ? { family: "flat", ...row } : row,
    );
    const data = { oracle: "elkjs@0.11.1", generator, seedRange: { first, last }, rows: trimmed };
    fs.writeFileSync(join(output, `${generator}.json.gz`), gzipSync(JSON.stringify(data)));
    console.log(generator, trimmed.length, "rows");
  }),
);
fs.rmSync(scratch, { recursive: true });
