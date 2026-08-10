import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import {
  elkLayeredOptionDefinitions,
  fromElkLayeredOptionId,
  toElkLayeredOptions,
} from "../src/layered/elk-options";

describe("ELK layered option inventory", () => {
  it("maps every elkjs 0.11.1 layered option exactly once", async () => {
    const elk = new ELK();
    const layered = (await elk.knownLayoutAlgorithms()).find(
      (algorithm) => algorithm.id === "org.eclipse.elk.layered",
    );
    const elkIds = layered?.knownOptions ?? [];
    const definitionsById = new Map(
      elkLayeredOptionDefinitions.map((definition) => [definition.elkId, definition]),
    );

    expect(elkIds).toHaveLength(152);
    expect(definitionsById.size).toBe(elkIds.length);
    expect([...definitionsById.keys()].sort()).toEqual([...elkIds].sort());
    expect(new Set(elkLayeredOptionDefinitions.map((definition) => definition.name)).size).toBe(
      elkIds.length,
    );
  });

  it("round-trips every exact ID through its simplified name", () => {
    for (const definition of elkLayeredOptionDefinitions) {
      expect(fromElkLayeredOptionId(definition.elkId)).toBe(definition.name);
    }
  });

  it("maps ergonomic common settings and advanced settings to exact IDs", () => {
    expect(
      toElkLayeredOptions({
        direction: "right",
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
        spacing: { node: 5, layer: 6 },
        settings: {
          edgeRouting: "SPLINES",
          "cycleBreaking.strategy": "GREEDY",
          "crossingMinimization.forceNodeModelOrder": true,
        },
      }),
    ).toEqual({
      "org.eclipse.elk.direction": "RIGHT",
      "org.eclipse.elk.padding": "[top=1,right=2,bottom=3,left=4]",
      "org.eclipse.elk.spacing.nodeNode": 5,
      "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": 6,
      "org.eclipse.elk.edgeRouting": "SPLINES",
      "org.eclipse.elk.layered.cycleBreaking.strategy": "GREEDY",
      "org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder": true,
    });
  });
});
