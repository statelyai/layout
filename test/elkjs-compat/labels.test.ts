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

  it.each(["DOWN", "RIGHT"] as const)(
    "keeps a %s backward label clear of a wider intermediate state",
    async (direction) => {
      const vertical = direction === "DOWN";
      const flowOut = vertical ? "SOUTH" : "EAST";
      const flowIn = vertical ? "NORTH" : "WEST";
      const result = await new ELK().layout({
        id: "root",
        layoutOptions: {
          "elk.direction": direction,
          "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
          "elk.layered.layering.strategy": "INTERACTIVE",
          "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        },
        children: [
          {
            id: "first",
            width: 120,
            height: 80,
            ports: [
              { id: "forward-source", layoutOptions: { "elk.port.side": flowOut } },
              { id: "back-target", layoutOptions: { "elk.port.side": flowIn } },
            ],
          },
          {
            id: "middle",
            width: vertical ? 420 : 120,
            height: vertical ? 80 : 320,
          },
          {
            id: "second",
            width: 120,
            height: 80,
            ports: [
              { id: "forward-target", layoutOptions: { "elk.port.side": flowIn } },
              { id: "back-source", layoutOptions: { "elk.port.side": flowOut } },
            ],
          },
          { id: "third", width: 120, height: 80 },
        ],
        edges: [
          {
            id: "forward",
            sources: ["forward-source"],
            targets: ["forward-target"],
            labels: [
              {
                id: "forward-label",
                width: 96,
                height: 40,
                layoutOptions: { "elk.edgeLabels.inline": "true" },
              },
            ],
          },
          { id: "first-middle", sources: ["first"], targets: ["middle"] },
          { id: "middle-second", sources: ["middle"], targets: ["second"] },
          {
            id: "back",
            sources: ["back-source"],
            targets: ["back-target"],
            labels: [
              {
                id: "back-label",
                width: 96,
                height: 40,
                layoutOptions: { "elk.edgeLabels.inline": "true" },
              },
            ],
          },
          { id: "continue", sources: ["second"], targets: ["third"] },
        ],
      });
      const middle = result.children?.find((node) => node.id === "middle");
      const back = result.edges?.find((edge) => edge.id === "back")?.labels?.[0];
      expect(middle).toBeDefined();
      expect(back).toBeDefined();
      if (!middle || !back) throw new Error("Expected branching feedback geometry");
      const overlaps =
        (back.x ?? 0) < (middle.x ?? 0) + (middle.width ?? 0) &&
        (back.x ?? 0) + (back.width ?? 0) > (middle.x ?? 0) &&
        (back.y ?? 0) < (middle.y ?? 0) + (middle.height ?? 0) &&
        (back.y ?? 0) + (back.height ?? 0) > (middle.y ?? 0);
      expect(overlaps).toBe(false);
      if (vertical) {
        expect(back.x).toBeGreaterThanOrEqual((middle.x ?? 0) + (middle.width ?? 0));
      } else {
        expect(back.y).toBeGreaterThanOrEqual((middle.y ?? 0) + (middle.height ?? 0));
      }
    },
  );

  it("keeps a long feedback label inside its endpoint span", async () => {
    const port = (id: string, side: "NORTH" | "SOUTH") => ({
      id,
      width: 20,
      height: 20,
      layoutOptions: { "elk.port.side": side },
    });
    const edge = (id: string, width: number) => ({
      id,
      sources: [`${id}__src`],
      targets: [`${id}__tgt`],
      labels: [
        {
          id,
          width,
          height: 44,
          layoutOptions: {
            "elk.edgeLabels.inline": "true",
            "elk.edgeLabels.placement": "CENTER",
          },
        },
      ],
    });
    const result = await new ELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "50",
        "elk.spacing.edgeEdge": "10",
        "elk.spacing.edgeNode": "10",
        "elk.spacing.edgeLabel": "2",
        "elk.layered.spacing.nodeNodeBetweenLayers": "30",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "10",
        "elk.layered.spacing.edgeNodeBetweenLayers": "10",
        "elk.layered.layering.strategy": "INTERACTIVE",
        "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.favorStraightEdges": "true",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
        "elk.layered.considerModelOrder.longEdgeStrategy": "DUMMY_NODE_OVER",
        "elk.layered.considerModelOrder.components": "MODEL_ORDER",
        "elk.layered.compaction.postCompaction.strategy": "LEFT",
        "elk.layered.compaction.postCompaction.constraints": "SCANLINE",
      },
      children: [
        {
          id: "title",
          width: 71.74,
          height: 52,
          ports: [port("START__src", "SOUTH"), port("RESTART__tgt", "NORTH")],
          layoutOptions: { "elk.layered.layering.layerConstraint": "FIRST_SEPARATE" },
        },
        {
          id: "playing",
          width: 112.75,
          height: 52,
          ports: [
            port("START__tgt", "NORTH"),
            port("PAUSE__src", "SOUTH"),
            port("PLAYING_DONE__src", "SOUTH"),
            port("RESUME__tgt", "NORTH"),
          ],
        },
        {
          id: "paused",
          width: 114.05,
          height: 52,
          ports: [
            port("PAUSE__tgt", "NORTH"),
            port("RESUME__src", "SOUTH"),
            port("PAUSED_DONE__src", "SOUTH"),
          ],
        },
        {
          id: "gameOver",
          width: 148.41,
          height: 52,
          ports: [
            port("PLAYING_DONE__tgt", "NORTH"),
            port("PAUSED_DONE__tgt", "NORTH"),
            port("RESTART__src", "SOUTH"),
          ],
        },
      ],
      edges: [
        edge("START", 73.6),
        edge("PAUSE", 73.71),
        edge("PLAYING_DONE", 113.71),
        edge("RESUME", 86.41),
        edge("PAUSED_DONE", 113.71),
        edge("RESTART", 91.2),
      ],
    });
    const title = result.children?.find((node) => node.id === "title");
    const gameOver = result.children?.find((node) => node.id === "gameOver");
    const restart = result.edges?.find((candidate) => candidate.id === "RESTART")?.labels?.[0];
    expect(title).toBeDefined();
    expect(gameOver).toBeDefined();
    expect(restart).toBeDefined();
    if (!title || !gameOver || !restart) throw new Error("Expected game-loop geometry");
    expect(restart.y).toBeGreaterThanOrEqual((title.y ?? 0) + (title.height ?? 0));
    expect((restart.y ?? 0) + (restart.height ?? 0)).toBeLessThanOrEqual(gameOver.y ?? 0);
    const overlaps = (
      left: { x?: number; y?: number; width?: number; height?: number },
      right: { x?: number; y?: number; width?: number; height?: number },
    ) =>
      (left.x ?? 0) < (right.x ?? 0) + (right.width ?? 0) &&
      (left.x ?? 0) + (left.width ?? 0) > (right.x ?? 0) &&
      (left.y ?? 0) < (right.y ?? 0) + (right.height ?? 0) &&
      (left.y ?? 0) + (left.height ?? 0) > (right.y ?? 0);
    const otherLabels =
      result.edges?.flatMap((candidate) =>
        candidate.id === "RESTART" ? [] : (candidate.labels ?? []),
      ) ?? [];
    expect(otherLabels.some((label) => overlaps(restart, label))).toBe(false);
    const restartSection = result.edges?.find((candidate) => candidate.id === "RESTART")
      ?.sections?.[0];
    const restartPoints = restartSection
      ? [restartSection.startPoint, ...(restartSection.bendPoints ?? []), restartSection.endPoint]
      : [];
    const maximumNodeRight = Math.max(
      ...(result.children ?? []).map((node) => (node.x ?? 0) + (node.width ?? 0)),
    );
    const exteriorTrack = restartPoints.find((point, index) => {
      const next = restartPoints[index + 1];
      return next && point.x === next.x && point.y !== next.y && point.x > maximumNodeRight;
    });
    expect(exteriorTrack?.x).toBeGreaterThanOrEqual(restart.x ?? 0);
    expect(exteriorTrack?.x).toBeLessThanOrEqual((restart.x ?? 0) + (restart.width ?? 0));
  });
});
