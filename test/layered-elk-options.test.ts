import ELK from "elkjs/lib/elk.bundled.js";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  elkLayeredOptionDefinitions,
  elkLayeredEnumValues,
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

  it("inventories every valid value of every ELK enum option", () => {
    const enumDefinitions = elkLayeredOptionDefinitions.filter(
      ({ type }) => type === "ENUM" || type === "ENUMSET",
    );
    expect(Object.keys(elkLayeredEnumValues).sort()).toEqual(
      enumDefinitions.map(({ name }) => name).sort(),
    );
    for (const definition of enumDefinitions) {
      const values = elkLayeredEnumValues[definition.name as keyof typeof elkLayeredEnumValues];
      expect(values, definition.name).not.toHaveLength(0);
      for (const value of values) {
        expect(
          toElkLayeredOptions({ settings: { [definition.name]: value } }),
          `${definition.name}=${value}`,
        ).toEqual({ [definition.elkId]: value });
      }
    }
  });

  it("executes every enum value in option-specific ELK differential suites", () => {
    const coverage = {
      "wrapping.strategy": ["oracle-wrapping.test.ts"],
      "wrapping.cutting.strategy": ["oracle-wrapping.test.ts"],
      "wrapping.validify.strategy": ["oracle-wrapping.test.ts"],
      "layerUnzipping.strategy": ["oracle-layer-unzipping.test.ts"],
      "nodePlacement.networkSimplex.nodeFlexibility": ["oracle-node-flexibility.test.ts"],
      "nodePlacement.networkSimplex.nodeFlexibility.default": ["oracle-node-flexibility.test.ts"],
      "edgeRouting.splines.mode": ["oracle-edge-routing.test.ts"],
      "topdown.nodeType": ["oracle-topdown-layout.test.ts"],
      edgeRouting: ["oracle-edge-routing.test.ts"],
      portConstraints: ["oracle-port-options.test.ts"],
      "port.side": ["oracle-port-options.test.ts"],
      alignment: ["oracle-node-alignment.test.ts"],
      hierarchyHandling: ["oracle-hierarchy-options.test.ts"],
      "nodeSize.constraints": ["oracle-node-labels.test.ts", "oracle-node-size-options.test.ts"],
      "nodeSize.options": ["oracle-node-size-options.test.ts"],
      direction: ["oracle-direction-feedback.test.ts", "oracle-port-options.test.ts"],
      "nodeLabels.placement": ["oracle-node-labels.test.ts", "oracle-node-size-options.test.ts"],
      "portLabels.placement": ["oracle-port-labels.test.ts"],
      "portAlignment.default": ["oracle-port-options.test.ts"],
      "portAlignment.north": ["oracle-port-options.test.ts"],
      "portAlignment.south": ["oracle-port-options.test.ts"],
      "portAlignment.west": ["oracle-port-options.test.ts"],
      "portAlignment.east": ["oracle-port-options.test.ts"],
      "layering.strategy": ["oracle-layering.test.ts"],
      "layering.nodePromotion.strategy": ["oracle-node-promotion.test.ts"],
      "layering.layerConstraint": ["oracle-layer-constraints.test.ts"],
      "cycleBreaking.strategy": ["oracle-cycle-breaking.test.ts"],
      "crossingMinimization.strategy": ["oracle-crossing-minimization.test.ts"],
      "crossingMinimization.greedySwitch.type": ["oracle-greedy-switch.test.ts"],
      "crossingMinimization.greedySwitchHierarchical.type": ["oracle-hierarchy-options.test.ts"],
      interactiveReferencePoint: ["oracle-interactive-reference-point.test.ts"],
      "nodePlacement.strategy": ["oracle-node-placement.test.ts"],
      "nodePlacement.bk.fixedAlignment": ["oracle-node-placement.test.ts"],
      "edgeRouting.selfLoopDistribution": ["oracle-self-loop-options.test.ts"],
      "edgeRouting.selfLoopOrdering": ["oracle-self-loop-options.test.ts"],
      contentAlignment: ["oracle-fixed-graph-size.test.ts"],
      "nodePlacement.bk.edgeStraightening": ["oracle-node-placement.test.ts"],
      "compaction.postCompaction.strategy": ["oracle-post-compaction.test.ts"],
      "compaction.postCompaction.constraints": ["oracle-post-compaction.test.ts"],
      "edgeLabels.placement": ["oracle-edge-labels.test.ts"],
      "edgeLabels.sideSelection": ["oracle-edge-labels.test.ts"],
      "edgeLabels.centerLabelPlacementStrategy": ["oracle-center-label-layer.test.ts"],
      directionCongruency: ["oracle-direction-feedback.test.ts"],
      portSortingStrategy: ["oracle-port-options.test.ts"],
      "considerModelOrder.strategy": ["oracle-model-order.test.ts"],
      "considerModelOrder.longEdgeStrategy": ["oracle-model-order.test.ts"],
      "considerModelOrder.components": ["oracle-connected-components.test.ts"],
      "considerModelOrder.groupModelOrder.cbGroupOrderStrategy": ["oracle-cycle-breaking.test.ts"],
      "considerModelOrder.groupModelOrder.cmGroupOrderStrategy": ["oracle-model-order.test.ts"],
    } satisfies Record<keyof typeof elkLayeredEnumValues, readonly string[]>;
    for (const [name, values] of Object.entries(elkLayeredEnumValues)) {
      const source = coverage[name as keyof typeof coverage]
        .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
        .join("\n");
      for (const value of values) {
        expect(source, `${name}=${value}`).toContain(value);
      }
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
