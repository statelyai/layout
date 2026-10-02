import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout, getLayoutRoutes } from "../src";
import { measureQuality } from "../scripts/heuristic-quality.mjs";
import fixtures from "./fixtures/heuristic-routing-fresh.json";
for (const f of fixtures)
  it(`routes fresh seed ${f.baseSeed} graph ${f.id} without collisions or retracing`, () => {
    const l = getLayeredLayout(createGraph(f.input), {
      direction: f.direction,
      padding: 24,
      spacing: { node: 36, layer: 56 },
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
      portSettings: (p) => ({ "port.side": p.data.side }),
      compound: () => ({ header: { width: 140, height: 36, side: "top" } }),
    });
    const m = measureQuality({ ...l, routes: [...getLayoutRoutes(l)] }, f.input);
    expect({
      nodeHits: m.nodeHits,
      labelNodeOverlaps: m.labelNodeOverlaps,
      selfRetraceLength: m.selfRetraceLength,
      diagonals: m.diagonals,
      missingRoutes: m.missingRoutes,
    }).toEqual({
      nodeHits: 0,
      labelNodeOverlaps: 0,
      selfRetraceLength: 0,
      diagonals: 0,
      missingRoutes: 0,
    });
  }, 30000);
