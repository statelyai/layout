// Compare simulated ELK port edge lists with real ELK after cycle breaking.
// Usage: tsx scripts/parity/validate-port-lists.ts <output.json> <report.json>...
import fs from "node:fs";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { setLayeredTraceObserver, type LayeredTraceEvent } from "../../src/internal/layered-trace";
import { readReport } from "./read-report.mjs";
import { traceElkPhases } from "./trace-phase-worker.mjs";

const [output, ...reports] = process.argv.slice(2);
if (!output || !reports.length) throw new Error("Pass an output path and retained reports");
// Native hierarchy segments and expanded parts keep the original edge id.
const original = (id: string) =>
  id.replace(/^(__native_hierarchy_edge_[^_]+_)+/, "").split("::")[0]!;
const outgoing = (ports: readonly { outgoing: readonly string[] }[]) =>
  JSON.stringify(ports.map((port) => port.outgoing.map(original)).filter((list) => list.length));
const summary: Record<
  string,
  { nodes: number; matched: number; cases: number; casesMatched: number }
> = {};
const mismatches = [];
for (const report of reports) {
  const counts = { nodes: 0, matched: 0, cases: 0, casesMatched: 0 };
  const rows = readReport(report).rows as Array<{
    input: ElkNode;
    elk?: { error?: string };
    seed?: number;
    direction?: string;
  }>;
  for (const row of rows) {
    if (row.elk?.error) continue;
    const events: LayeredTraceEvent[] = [];
    const previous = setLayeredTraceObserver((event) => {
      if (event.kind === "port-lists") events.push(event);
    });
    try {
      await new NativeELK().layout(structuredClone(row.input));
    } finally {
      setLayeredTraceObserver(previous);
    }
    const elk = await traceElkPhases(row.input);
    let all = true;
    for (const event of events) {
      if (event.kind !== "port-lists") continue;
      const real = [...event.ports.keys()].filter((id) => !id.startsWith("__"));
      const scope = elk.scopes.find((s) => real.length && real.every((id) => s.portLists[id]));
      if (!scope) continue;
      for (const id of real) {
        counts.nodes++;
        const native = event.ports.get(id)!,
          expected = scope.portLists[id]!;
        if (outgoing(native) === outgoing(expected)) counts.matched++;
        else {
          all = false;
          mismatches.push({
            report,
            seed: row.seed,
            direction: row.direction,
            node: id,
            native: outgoing(native),
            elk: outgoing(expected),
          });
        }
      }
    }
    counts.cases++;
    if (all) counts.casesMatched++;
  }
  summary[report] = counts;
  console.log(report, counts);
}
fs.writeFileSync(
  output,
  JSON.stringify({ oracle: "elkjs@0.11.1", summary, mismatches }, null, 1) + "\n",
);
