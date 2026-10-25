import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

const rows = (
  readReport("docs/heuristics/quality-statecharts/corpus.json.gz") as {
    rows: Array<{ input: ElkNode; elk: { graph?: ElkNode } }>;
  }
).rows;
const clean = Object.fromEntries(HARD.map((key) => [key, 0]));
const hard = (metrics: Record<string, number>) =>
  Object.fromEntries(HARD.map((key) => [key, metrics[key]]));

/** Each self loop's ports, route and labels, relative to its node. */
function selfLoops(graph: ElkNode) {
  const nodes = new Map<string, ElkNode>(),
    owner = new Map<string, ElkNode>();
  for (const node of graph.children ?? []) {
    nodes.set(String(node.id), node);
    for (const port of node.ports ?? []) owner.set(String(port.id), node);
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return (graph.edges ?? []).flatMap((edge) => {
    const node = owner.get(String(edge.sources?.[0]));
    if (!node || node !== owner.get(String(edge.targets?.[0]))) return [];
    const at = (point: { x?: number; y?: number }) => [
      round(point.x! - node.x!),
      round(point.y! - node.y!),
    ];
    const port = (id: unknown) => node.ports!.find((candidate) => candidate.id === id)!;
    return [
      {
        id: edge.id,
        ports: [port(edge.sources![0]), port(edge.targets![0])].map(({ x, y }) => [
          round(x!),
          round(y!),
        ]),
        route: edge.sections!.flatMap((section) =>
          [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(at),
        ),
        labels: (edge.labels ?? []).map(at),
      },
    ];
  });
}

// The editor gives each self loop two ports of its own with fixed-looking
// sides, but leaves port constraints UNDEFINED. ELK hides such loop-only
// ports and restores them on the loop's side (internal NORTH, so WEST in
// DOWN and UP layouts), with the label beside the loop and centered on the
// node. Native routed these loops across the incoming edges' channel with
// the label on top of them.
it.each([12, 22, 36, 516, 517, 518, 519, 541, 1094])(
  "routes editor self loops and their labels like ELK (row %i)",
  async (index) => {
    const { input, elk } = rows[index]!;
    const layout = await new NativeELK().layout(structuredClone(input));
    expect(hard(score(layout, input))).toEqual(clean);
    expect(selfLoops(layout)).toEqual(selfLoops(elk.graph!));
  },
);
