/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/test-bug-klay-22.js at tag 0.11.1.
 * Copyright (c) 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: node labels", () => {
  it("places labels with global and node-specific options", async () => {
    const elk = new ELK();
    const result = await elk.layout(
      {
        id: "root",
        children: [
          {
            id: "n1",
            width: 100,
            height: 100,
            labels: [{ id: "l1", text: "Label1" }],
          },
          {
            id: "n2",
            width: 100,
            height: 100,
            labels: [
              {
                id: "l2",
                text: "Label2",
                layoutOptions: {
                  "elk.nodeLabels.placement": "INSIDE V_CENTER H_CENTER",
                },
              },
            ],
          },
        ],
        edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
      },
      {
        layoutOptions: {
          "elk.nodeLabels.placement": "OUTSIDE V_TOP H_CENTER",
        },
      },
    );

    expect(result.children?.[0]?.labels?.[0]).toMatchObject({ x: 50, y: -5 });
    expect(result.children?.[1]?.labels?.[0]).toMatchObject({ x: 50, y: 50 });
  });

  it("places a backward edge label beside the corridor between its endpoint layers", async () => {
    const elk = new ELK();
    const result = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.direction": "DOWN",
        "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
        "elk.layered.layering.strategy": "INTERACTIVE",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      },
      children: [
        {
          id: "first",
          width: 180,
          height: 96,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            { id: "next-source", layoutOptions: { "elk.port.side": "SOUTH" } },
            { id: "back-target", layoutOptions: { "elk.port.side": "NORTH" } },
          ],
          children: [{ id: "first-detail", width: 120, height: 40 }],
        },
        {
          id: "second",
          width: 180,
          height: 96,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            { id: "next-target", layoutOptions: { "elk.port.side": "NORTH" } },
            { id: "back-source", layoutOptions: { "elk.port.side": "SOUTH" } },
            { id: "continue-source", layoutOptions: { "elk.port.side": "SOUTH" } },
          ],
        },
        {
          id: "third",
          width: 180,
          height: 96,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [{ id: "continue-target", layoutOptions: { "elk.port.side": "NORTH" } }],
        },
      ],
      edges: [
        {
          id: "next",
          sources: ["next-source"],
          targets: ["next-target"],
          labels: [
            {
              id: "next-label",
              width: 120,
              height: 48,
              layoutOptions: { "elk.edgeLabels.inline": "true" },
            },
          ],
        },
        {
          id: "back",
          sources: ["back-source"],
          targets: ["back-target"],
          labels: [
            {
              id: "back-label",
              width: 120,
              height: 48,
              layoutOptions: { "elk.edgeLabels.inline": "true" },
            },
          ],
        },
        {
          id: "continue",
          sources: ["continue-source"],
          targets: ["continue-target"],
          labels: [
            {
              id: "continue-label",
              width: 120,
              height: 48,
              layoutOptions: { "elk.edgeLabels.inline": "true" },
            },
          ],
        },
      ],
    });
    const first = result.children?.find((node) => node.id === "first");
    const second = result.children?.find((node) => node.id === "second");
    const back = result.edges?.find((edge) => edge.id === "back")?.labels?.[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(back).toBeDefined();
    if (!first || !second || !back) throw new Error("Expected laid-out feedback graph");
    expect(back.y).toBeGreaterThanOrEqual((first.y ?? 0) + (first.height ?? 0));
    expect((back.y ?? 0) + (back.height ?? 0)).toBeLessThanOrEqual(second.y ?? 0);
    expect(back.x).toBeGreaterThanOrEqual(
      Math.max((first.x ?? 0) + (first.width ?? 0), (second.x ?? 0) + (second.width ?? 0)),
    );
  });
});
