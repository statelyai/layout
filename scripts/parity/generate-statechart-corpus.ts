// Generate the statechart quality corpus: the exact ELK inputs the Stately
// editor's layoutGraph sends for its machine corpora, with real-ELK output,
// split by machine into a diagnosis corpus and a holdout.
// Usage:
//   tsx scripts/parity/generate-statechart-corpus.ts <dir> [--raw <capture.json>]
// --raw dedupes an editor capture into <dir>/captured-inputs.json.gz first.
// Real elkjs output depends on earlier layouts in the process: this always
// regenerates both files, in a fixed order, in one process.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import OracleELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "../../src/elkjs/types";

interface Use {
  source: string;
  machine: string;
  direction: string;
  scope: string | null;
  call: number;
}
interface CapturedInput {
  input: ElkNode;
  args?: unknown;
  uses: Use[];
}
interface Captured {
  capturedAt: string;
  layoutPackage: string;
  machines: Array<{ source: string; id: string } & Record<string, unknown>>;
  conversionFailures: unknown[];
  layoutErrors: unknown[];
  inputs: CapturedInput[];
}

const argv = process.argv.slice(2);
const rawAt = argv.indexOf("--raw");
const dir = argv.find((_, i) => rawAt < 0 || (i !== rawAt && i !== rawAt + 1));
if (!dir) throw new Error("Usage: generate-statechart-corpus.ts <dir> [--raw <capture.json>]");
const capturedPath = join(dir, "captured-inputs.json.gz");

/** Nodes in an ELK graph, all levels. */
const countNodes = (node: ElkNode): number =>
  (node.children ?? []).reduce((sum, child) => sum + 1 + countNodes(child), 0);

if (rawAt >= 0) {
  const raw = JSON.parse(fs.readFileSync(argv[rawAt + 1]!, "utf8")) as Omit<Captured, "inputs"> & {
    calls: Array<Use & { graph: ElkNode; args?: unknown }>;
  };
  const byKey = new Map<string, CapturedInput>();
  for (const { graph, args, ...use } of raw.calls) {
    const key = JSON.stringify({ graph, args });
    const existing = byKey.get(key);
    if (existing) existing.uses.push(use);
    else byKey.set(key, { input: graph, ...(args === undefined ? {} : { args }), uses: [use] });
  }
  const { calls: _calls, ...meta } = raw;
  const captured: Captured = { ...meta, inputs: [...byKey.values()] };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(capturedPath, gzipSync(JSON.stringify(captured)));
  console.log(raw.calls.length, "calls,", captured.inputs.length, "distinct inputs");
}

const captured = JSON.parse(gunzipSync(fs.readFileSync(capturedPath)).toString("utf8")) as Captured;

/** Machines split by the first byte of sha256(source/machine): even → corpus, odd → holdout. */
const machineKey = (use: Use) => `${use.source}/${use.machine}`;
const isHoldout = (key: string) => (createHash("sha256").update(key).digest()[0]! & 1) === 1;

const halves = { corpus: [] as CapturedInput[], holdout: [] as CapturedInput[] };
let trivial = 0;
for (const entry of captured.inputs) {
  // A single node has nothing to order or route.
  if (countNodes(entry.input) < 2) {
    trivial++;
    continue;
  }
  // An input shared by several machines belongs to its smallest machine key.
  const owner = entry.uses.map(machineKey).sort()[0]!;
  halves[isHoldout(owner) ? "holdout" : "corpus"].push(entry);
}

const oracle = new OracleELK();
for (const [half, entries] of Object.entries(halves)) {
  const rows = [];
  for (const [seed, entry] of entries.entries()) {
    const owner = [...entry.uses].sort((a, b) => machineKey(a).localeCompare(machineKey(b)))[0]!;
    let elk: { graph: ElkNode } | { error: string };
    try {
      elk = {
        graph: (await oracle.layout(
          structuredClone(entry.input) as never,
          entry.args as never,
        )) as ElkNode,
      };
    } catch (error) {
      elk = { error: String(error) };
    }
    rows.push({
      family: owner.source,
      seed,
      direction: owner.direction,
      machine: owner.machine,
      scope: owner.scope,
      uses: entry.uses.length,
      input: entry.input,
      elk,
    });
  }
  const machines = captured.machines
    .map(({ source, id }) => `${source}/${id}`)
    .filter((key) => isHoldout(key) === (half === "holdout"));
  const data = {
    oracle: "elkjs@0.11.1",
    generator: "statechart-corpus-v1",
    capturedAt: captured.capturedAt,
    layoutPackage: captured.layoutPackage,
    machines,
    rows,
  };
  fs.writeFileSync(join(dir, `${half}.json.gz`), gzipSync(JSON.stringify(data)));
  const errors = rows.filter((row) => "error" in row.elk).length;
  console.log(half, rows.length, "rows,", machines.length, "machines,", errors, "oracle errors");
}
console.log(trivial, "single-node inputs skipped");
