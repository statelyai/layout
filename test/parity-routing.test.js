import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout, getLayoutRoutes } from "../src";
import { measureQuality } from "../scripts/heuristic-quality.mjs";
import { readFixture } from "./helpers/fixture";
const fixtures = readFixture("parity-routing");

for (const f of fixtures)
  it(`repairs routing defects from random seed ${f.seed}, graph ${f.id}`, () => {
    const layout = getLayeredLayout(createGraph(f.input), {
      direction: f.direction,
      padding: 24,
      spacing: { node: 36, layer: 56 },
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
      portSettings: (p) => ({ "port.side": p.data.side }),
      compound: () => ({ header: { width: 140, height: 36, side: "top" } }),
    });
    const m = measureQuality({ ...layout, routes: [...getLayoutRoutes(layout)] }, f.input);
    for (const key of [
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
    ])
      expect(m[key], key).toBe(0);
  }, 30000);
