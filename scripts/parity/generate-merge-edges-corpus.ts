// Generate a quality corpus of flat graphs with elk.layered.mergeEdges: the
// flat parity fixtures with merged edges, and real-ELK output for an inclusive
// seed range in all four directions, trimmed to what the quality gate reads.
// Real elkjs output depends on earlier layouts in the process: regenerate
// whole seed ranges, never single seeds.
// Usage: tsx scripts/parity/generate-merge-edges-corpus.ts <output.json.gz> <firstSeed> <lastSeed>
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import OracleELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "../../src/elkjs/types";
import { flatFixture } from "./flat-corpus";

const [output, firstArgument, lastArgument] = process.argv.slice(2);
const first = Number(firstArgument),
  last = Number(lastArgument);
if (!output || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last < first)
  throw new Error("Usage: generate-merge-edges-corpus.ts <output.json.gz> <firstSeed> <lastSeed>");

/** A flat parity fixture whose edges merge. */
function mergeEdgesFixture(seed: number, direction: string): ElkNode {
  const input = flatFixture(seed, direction);
  input.layoutOptions = { ...input.layoutOptions, "elk.layered.mergeEdges": true };
  return input;
}

const oracle = new OracleELK();
const rows = [];
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"])
  for (let seed = first; seed <= last; seed++) {
    const input = mergeEdgesFixture(seed, direction);
    let elk: { graph: ElkNode } | { error: string };
    try {
      elk = { graph: (await oracle.layout(structuredClone(input) as never)) as ElkNode };
    } catch (error) {
      elk = { error: String(error) };
    }
    rows.push({ family: "merge-edges", seed, direction, input, elk });
  }
const data = {
  oracle: "elkjs@0.11.1",
  generator: "merge-edges-v1",
  seedRange: { first, last },
  rows,
};
fs.writeFileSync(output, gzipSync(JSON.stringify(data)));
console.log(rows.length, "rows");
