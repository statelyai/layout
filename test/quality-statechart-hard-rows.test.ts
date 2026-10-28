import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, qualityLayout, score } from "../scripts/parity/quality-gate";

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };

const rows = (
  readReport("docs/heuristics/quality-statecharts/corpus.json.gz") as {
    rows: Array<{ input: ElkNode }>;
  }
).rows;

const selfLoopIds = (node: ElkNode): string[] => [
  ...(node.edges ?? [])
    .filter((edge) => edge.sources[0] === edge.targets[0])
    .map((edge) => String(edge.id)),
  ...(node.children ?? []).flatMap(selfLoopIds),
];

/** Labels that another edge's route passes through. */
const hitLabelIds = (graph: ElkNode) => {
  const { layout, routes } = qualityLayout(graph);
  const segments = new Map(
    [...routes].map(([id, route]) => [
      id,
      (
        route as { sections: Array<{ path: { start: Point; segments: { to: Point }[] } }> }
      ).sections.flatMap(({ path }) => {
        const points = [path.start, ...path.segments.map((segment) => segment.to)];
        return points.slice(1).map((to, index) => [points[index]!, to] as const);
      }),
    ]),
  );
  const crosses = ([a, b]: readonly [Point, Point], rect: Rect) =>
    Math.max(a.x, b.x) > rect.x + 1e-6 &&
    Math.min(a.x, b.x) < rect.x + rect.width - 1e-6 &&
    Math.max(a.y, b.y) > rect.y + 1e-6 &&
    Math.min(a.y, b.y) < rect.y + rect.height - 1e-6;
  return new Set(
    layout.edges
      .filter(
        (label) =>
          label.width > 0 &&
          [...segments].some(
            ([id, route]) => id !== label.id && route.some((segment) => crosses(segment, label)),
          ),
      )
      .map((label) => label.id),
  );
};

// The Magscope coordinator in all four directions (real ELK crashes on it).
// Native had feedback legs cutting through taller compound siblings and their
// labels, and a compound boundary port flipped by its parent (RIGHT and LEFT,
// whose compounds lay out DOWN). The remaining label hits are on self-loop
// labels stacked above their states, as in 0.5.0.
it.each([68, 69, 70, 71])(
  "lays out statechart row %i without hard defects",
  async (index) => {
    const { input } = rows[index]!;
    const layout = await new NativeELK().layout(structuredClone(input));
    const metrics = score(layout, input);
    expect(
      Object.fromEntries(
        HARD.filter((key) => key !== "edgeLabelHits").map((key) => [key, metrics[key]]),
      ),
    ).toEqual(
      Object.fromEntries(HARD.filter((key) => key !== "edgeLabelHits").map((key) => [key, 0])),
    );
    const loops = new Set(selfLoopIds(input));
    expect([...hitLabelIds(layout)].filter((id) => !loops.has(id))).toEqual([]);
  },
  30000,
);
