import fs from "node:fs";
import { readReport } from "./read-report.mjs";
import { compoundGeometry, geometryDifferences, type GeometryDifference } from "./compound-corpus";
import type { ElkNode, ElkEdge, ElkPoint } from "../../src/elkjs/types";
interface FrozenRow {
  input: ElkNode;
  native: { graph?: ElkNode; error?: string };
  elk: { graph?: ElkNode; error?: string };
}
const [beforePath, afterPath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !output)
  throw new Error("Pass before report, after report and output");
const before = readReport(beforePath) as { rows: FrozenRow[] },
  after = readReport(afterPath) as { rows: FrozenRow[] };
if (before.rows.length !== after.rows.length) throw new Error("Reports differ in case count");
const changedNonJunction: { i: number; d: GeometryDifference[] }[] = [],
  offRoute: { i: number; edge: ElkEdge["id"]; p: ElkPoint }[] = [],
  missing = { before: 0, after: 0 },
  extra = { before: 0, after: 0 };
function visit(root: ElkNode | undefined, callback: (edge: ElkEdge) => void) {
  if (!root) return;
  for (const edge of root.edges ?? []) callback(edge);
  for (const node of root.children ?? []) visit(node, callback);
}
function strip(graph: ElkNode) {
  graph = structuredClone(graph);
  visit(graph, (e) => delete e.junctionPoints);
  return graph;
}
for (let i = 0; i < after.rows.length; i++) {
  const a = after.rows[i],
    b = before.rows[i];
  if (JSON.stringify(a.input) !== JSON.stringify(b.input))
    throw new Error("Reports change input at row " + i);
  if (!a.native.graph || !b.native.graph) continue;
  const d = geometryDifferences(
    compoundGeometry(strip(a.native.graph)),
    compoundGeometry(strip(b.native.graph)),
  );
  if (d.length) changedNonJunction.push({ i, d });
  if (a.elk.graph) {
    const oracle = new Map<ElkEdge["id"], ElkEdge>();
    visit(a.elk.graph, (e) => oracle.set(e.id, e));
    for (const [key, row] of [
      ["before", b],
      ["after", a],
    ] as const)
      visit(row.native.graph, (e) => {
        const o = oracle.get(e.id);
        missing[key] += Math.max(
          0,
          (o?.junctionPoints?.length ?? 0) - (e.junctionPoints?.length ?? 0),
        );
        extra[key] += Math.max(
          0,
          (e.junctionPoints?.length ?? 0) - (o?.junctionPoints?.length ?? 0),
        );
      });
  }
  visit(a.native.graph, (e) => {
    for (const p of e.junctionPoints ?? []) {
      const onRoute = (e.sections ?? []).some((s) => {
        const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
        return points.some((q, j) => {
          if (!j) return false;
          const z = points[j - 1]!,
            dx = q.x - z.x,
            dy = q.y - z.y;
          return (
            Math.abs((p.x - z.x) * dy - (p.y - z.y) * dx) < 1e-6 &&
            p.x >= Math.min(z.x, q.x) - 1e-6 &&
            p.x <= Math.max(z.x, q.x) + 1e-6 &&
            p.y >= Math.min(z.y, q.y) - 1e-6 &&
            p.y <= Math.max(z.y, q.y) + 1e-6
          );
        });
      });
      if (!onRoute) offRoute.push({ i, edge: e.id, p });
    }
  });
}
const audit = { changedNonJunction, missing, extra, offRoute };
fs.writeFileSync(output, JSON.stringify(audit, null, 2) + "\n");
console.log({
  nonJunctionChanges: changedNonJunction.length,
  missing,
  extra,
  offRoute: offRoute.length,
});

if (changedNonJunction.length || offRoute.length) process.exitCode = 1;
