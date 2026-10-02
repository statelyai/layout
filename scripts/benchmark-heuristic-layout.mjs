import { execFileSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { measureQuality } from "./heuristic-quality.mjs";

const output = resolve(process.argv[2] ?? "docs/heuristics/generated/baseline");
const args = process.argv.slice(3);
const checkParity = args.includes("--check-parity");
const randomAt = args.indexOf("--random-seeds");
const positional = args.filter(
  (arg, i) => arg !== "--check-parity" && i !== randomAt && i !== randomAt + 1,
);
let seeds;
if (randomAt >= 0) {
  const count = Number(args[randomAt + 1]);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000 || positional.length)
    throw new Error("Use --random-seeds COUNT (1–1000) without explicit seeds");
  const drawn = new Set();
  while (drawn.size < count) drawn.add(randomInt(0, 2 ** 32));
  seeds = [...drawn];
} else {
  seeds = args.filter((arg) => arg !== "--check-parity").length
    ? args.filter((arg) => arg !== "--check-parity").map(Number)
    : [20261001, 20261102, 20261203];
}
if (
  new Set(seeds).size !== seeds.length ||
  seeds.some((s) => !Number.isSafeInteger(s) || s < 0 || s > 0xffffffff)
)
  throw new Error("Use distinct unsigned 32-bit seeds");
await mkdir(output, { recursive: true });
// Persist fresh draws before execution so interrupted runs can be replayed.
await writeFile(resolve(output, "seeds.json"), JSON.stringify(seeds, null, 2) + "\n");
console.log("Building current Stately source before comparison");
execFileSync("pnpm", ["build"], { maxBuffer: 10 * 1024 * 1024 });
const rows = [];
for (const seed of seeds) {
  console.log(`Generating and measuring seed ${seed}`);
  const directory = resolve(output, `seed-${seed}`);
  let generationError;
  try {
    execFileSync(
      process.execPath,
      ["scripts/generate-heuristic-corpus.mjs", String(seed), directory],
      { maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (error) {
    generationError = String(error);
  }
  const corpus = JSON.parse(await readFile(resolve(directory, "corpus.json"), "utf8"));
  for (const c of corpus.cases) {
    const row = {
      seed,
      graph: c.id,
      title: c.title,
      direction: c.direction,
      revision: corpus.revision,
    };
    for (const engine of ["stately", "elk"]) {
      const error = c[engine].error;
      const layout = engine === "stately" ? c.layout : c.elk.layout;
      row[engine] =
        error || !layout
          ? { error: error ?? generationError ?? "Missing layout" }
          : { metrics: measureQuality(layout, c.input) };
    }
    rows.push(row);
  }
}
const metrics = Object.keys(
  rows.find((r) => r.stately.metrics)?.stately.metrics ??
    rows.find((r) => r.elk.metrics)?.elk.metrics ??
    {},
);
const comparison = Object.fromEntries(
  metrics.map((metric) => [metric, { statelyBetter: 0, tied: 0, elkBetter: 0 }]),
);
for (const row of rows)
  if (row.stately.metrics && row.elk.metrics)
    for (const metric of metrics) {
      const a = row.stately.metrics[metric],
        b = row.elk.metrics[metric];
      comparison[metric][Math.abs(a - b) < 1e-6 ? "tied" : a < b ? "statelyBetter" : "elkBetter"]++;
    }
const geometryMetrics = [
  "missingNodes",
  "missingRoutes",
  "nonFinite",
  "diagonals",
  "nodeHits",
  "nodeOverlaps",
  "labelNodeOverlaps",
  "labelOverlaps",
  "edgeLabelHits",
  "selfRetraceLength",
];
const parityFailures = [];
for (const row of rows) {
  const id = `${row.seed}/${row.graph}`;
  if (!row.stately.metrics) parityFailures.push({ id, reason: "native layout failed" });
  else
    for (const metric of geometryMetrics)
      if (row.stately.metrics[metric] > 1e-6)
        parityFailures.push({ id, metric, native: row.stately.metrics[metric], limit: 0 });
  if (!row.elk.metrics)
    parityFailures.push({ id, reason: "oracle layout failed; parity unverified" });
  if (row.stately.metrics && row.elk.metrics)
    for (const metric of ["edgeCrossings", "bends"])
      if (row.stately.metrics[metric] > row.elk.metrics[metric] + 1e-6)
        parityFailures.push({
          id,
          metric,
          native: row.stately.metrics[metric],
          oracle: row.elk.metrics[metric],
        });
}
const parity = {
  passed: !parityFailures.length,
  policy:
    "Native geometry invariants pass on every graph; crossings and bends no worse than real ELK on each graph; oracle failures remain unverified.",
  failures: parityFailures,
};
const require = createRequire(import.meta.url);
const report = {
  schemaVersion: 1,
  scorerSha256: createHash("sha256")
    .update(await readFile(new URL("./heuristic-quality.mjs", import.meta.url)))
    .digest("hex"),
  generatorSha256: createHash("sha256")
    .update(await readFile(new URL("./generate-heuristic-corpus.mjs", import.meta.url)))
    .digest("hex"),
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  elkVersion: require("elkjs/package.json").version,
  seeds,
  reviewSeed: 20261001,
  rows,
  comparison,
  parity,
};
await writeFile(resolve(output, "baseline.json"), JSON.stringify(report, null, 2) + "\n");
const format = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
let markdown = `# Stately / ELK baseline\n\nSource: \`${report.revision}\`${report.workingTreeDirty ? " (working tree includes baseline tooling changes)" : ""}; elkjs ${report.elkVersion}. ${rows.length} graphs; seeds ${seeds.join(", ")}. Review seed: 20261001; other seeds are fresh evaluation samples, not sealed holdouts after this run.\n\nAll metrics use the same geometry scorer. Lower is better; no combined score or parity claim. Missing/error layouts are reported separately, never dropped or resampled.\n\n| Metric | Stately better | Tied | ELK better |\n| --- | ---: | ---: | ---: |\n`;
for (const [name, counts] of Object.entries(comparison))
  markdown += `| ${name} | ${counts.statelyBetter} | ${counts.tied} | ${counts.elkBetter} |\n`;
markdown +=
  "\nPer-graph values below are Stately / ELK.\n\n| Seed / graph | Node hits | Label-node overlaps | Crossings | Shared track length | Bends | Route length | Area |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n";
for (const r of rows) {
  const pair = (k) =>
    r.stately.metrics && r.elk.metrics
      ? `${format(r.stately.metrics[k])} / ${format(r.elk.metrics[k])}`
      : "error";
  markdown += `| ${r.seed} / ${r.graph} | ${["nodeHits", "labelNodeOverlaps", "edgeCrossings", "edgeOverlapLength", "bends", "routeLength", "area"].map(pair).join(" | ")} |\n`;
}
markdown += `\nParity gate: **${parity.passed ? "PASS" : "FAIL"}**. ${parity.policy} ${parity.failures.length} failed checks. This finite sample does not prove universal graph parity.\n`;
const failures = rows.filter((r) => r.stately.error || r.elk.error);
if (failures.length)
  markdown +=
    "\nLayout failures:\n\n" +
    failures
      .map(
        (r) =>
          `- ${r.seed}/${r.graph}: Stately ${r.stately.error ?? "OK"}; ELK ${r.elk.error ?? "OK"}`,
      )
      .join("\n") +
    "\n";
await writeFile(resolve(output, "baseline.md"), markdown);
console.log(
  JSON.stringify(
    {
      graphs: rows.length,
      failures: failures.length,
      parityPassed: parity.passed,
      parityFailedChecks: parity.failures.length,
      comparison,
    },
    null,
    2,
  ),
);
if (failures.length || (checkParity && !parity.passed)) process.exitCode = 1;
