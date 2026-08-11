import ELK from "elkjs/lib/elk.bundled.js";
import { readFileSync, readdirSync } from "node:fs";
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

  it("has ELK differential coverage for every simplified option", () => {
    const oracleFiles = readdirSync(new URL(".", import.meta.url))
      .filter((file) => file.startsWith("oracle-") && file.endsWith(".test.ts"))
      .map((file) => [file, readFileSync(new URL(file, import.meta.url), "utf8")] as const);
    const allOracleTests = oracleFiles.map(([, source]) => source).join("\n");
    const parameterizedCoverage: Partial<
      Record<(typeof elkLayeredOptionDefinitions)[number]["name"], readonly [string, string]>
    > = {
      "spacing.layer": [
        "oracle-spacing-options.test.ts",
        "elk.layered.spacing.nodeNodeBetweenLayers",
      ],
      "wrapping.multiEdge.improveCuts": ["oracle-wrapping.test.ts", '["improveCuts"'],
      "wrapping.multiEdge.distancePenalty": ["oracle-wrapping.test.ts", '["distancePenalty"'],
      "wrapping.multiEdge.improveWrappedEdges": [
        "oracle-wrapping.test.ts",
        '["improveWrappedEdges"',
      ],
      "portAlignment.north": ["oracle-port-options.test.ts", "side.toLowerCase()"],
      "portAlignment.south": ["oracle-port-options.test.ts", "side.toLowerCase()"],
      "portAlignment.west": ["oracle-port-options.test.ts", "side.toLowerCase()"],
      "layering.minWidth.upperBoundOnWidth": ["oracle-layering.test.ts", '["upperBoundOnWidth"'],
      "layering.minWidth.upperLayerEstimationScalingFactor": [
        "oracle-layering.test.ts",
        '["upperLayerEstimationScalingFactor"',
      ],
      "considerModelOrder.groupModelOrder.cbPreferredSourceId": [
        "oracle-cycle-breaking.test.ts",
        '["cbPreferredSourceId"',
      ],
      "considerModelOrder.groupModelOrder.cbPreferredTargetId": [
        "oracle-cycle-breaking.test.ts",
        '["cbPreferredTargetId"',
      ],
    };

    for (const definition of elkLayeredOptionDefinitions) {
      if (allOracleTests.includes(definition.name)) continue;
      const evidence = parameterizedCoverage[definition.name];
      expect(evidence, `missing differential test for ${definition.name}`).toBeDefined();
      const [file, needle] = evidence!;
      const source = oracleFiles.find(([candidate]) => candidate === file)?.[1] ?? "";
      expect(source, `${definition.name} coverage moved or disappeared`).toContain(needle);
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
