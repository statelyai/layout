// Times the Stately statechart fixtures through the elkjs facade and real ELK.
// Fails when native takes more than BUDGET times ELK's CPU time on any fixture.
// Usage: tsx scripts/bench-statecharts.ts [budget=2]
import fs from "node:fs";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";

const budget = Number(process.argv[2] ?? 2);
const fixtures = [
  "viz-two-state-cycle",
  "viz-feedback-form",
  "email-drafter-viz",
  "babyfood-statechart",
  "cross-hierarchy-viz",
  "editor-modes-native",
  "espresso-native",
];

/** Stately graph fixtures ({ nodes, edges }) as nested ELK JSON. */
function toElk(fixture: {
  id: string;
  nodes: Array<{ id: string; parentId?: string | null; width?: number; height?: number }>;
  edges: Array<{ id: string; sourceId: string; targetId: string; label?: string }>;
}): ElkNode {
  const nodes = new Map<string, ElkNode>(
    fixture.nodes.map((node) => [
      node.id,
      { id: node.id, width: node.width ?? 120, height: node.height ?? 48 },
    ]),
  );
  const root: ElkNode = {
    id: fixture.id,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=48,left=24,bottom=24,right=24]",
    },
    children: [],
  };
  for (const node of fixture.nodes)
    ((node.parentId ? nodes.get(node.parentId)! : root).children ??= []).push(nodes.get(node.id)!);
  root.edges = fixture.edges.map((edge) => ({
    id: edge.id,
    sources: [edge.sourceId],
    targets: [edge.targetId],
    ...(edge.label
      ? { labels: [{ text: edge.label, width: edge.label.length * 7, height: 14 }] }
      : {}),
  }));
  return root;
}

/** Best-of-five CPU milliseconds; CPU time is steadier than wall time under load. */
async function cpu(run: () => Promise<unknown>): Promise<number> {
  await run();
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const start = process.cpuUsage();
    await run();
    const used = process.cpuUsage(start);
    best = Math.min(best, (used.user + used.system) / 1000);
  }
  return best;
}

let failed = false;
for (const name of fixtures) {
  const data = JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, "utf8"));
  const input: ElkNode = Array.isArray(data.nodes) ? toElk(data) : data;
  const native = await cpu(() => new NativeELK().layout(structuredClone(input)));
  let elk: number | undefined;
  try {
    elk = await cpu(() => new OracleELK().layout(structuredClone(input) as never));
  } catch {
    // ELK throws on some Stately inputs; native is then reported without a ratio.
  }
  const ratio = elk === undefined ? undefined : native / elk;
  const over = ratio !== undefined && ratio > budget;
  failed ||= over;
  console.log(
    `${name.padEnd(22)} native ${native.toFixed(0).padStart(5)} ms   elk ${
      elk === undefined ? "error" : `${elk.toFixed(0).padStart(4)} ms`
    }   ${ratio === undefined ? "" : `${ratio.toFixed(1)}x`}${over ? "  OVER BUDGET" : ""}`,
  );
}
if (failed) {
  console.error(`Native exceeded ${budget}x ELK's CPU time on at least one fixture.`);
  process.exit(1);
}
