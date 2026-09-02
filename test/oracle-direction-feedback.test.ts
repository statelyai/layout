import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkEdge, type ElkNode } from "../src/elkjs";

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Missing ${description}`);
  return value;
}

describe("ELK direction congruency parity", () => {
  for (const direction of ["RIGHT", "DOWN", "LEFT", "UP"] as const) {
    for (const congruency of ["READING_DIRECTION", "ROTATION"] as const) {
      it(`matches ${direction} ${congruency}`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.separateConnectedComponents": "false",
            "elk.layered.directionCongruency": congruency,
          },
          children: [
            { id: "a", width: 20, height: 20 },
            { id: "b", width: 20, height: 20 },
            { id: "target", width: 20, height: 20 },
          ],
          edges: [
            { id: "a-target", sources: ["a"], targets: ["target"] },
            { id: "b-target", sources: ["b"], targets: ["target"] },
          ],
        };
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        const actual = await new NativeELK().layout(structuredClone(input));
        for (const id of ["a", "b"]) {
          const expectedNode = expected.children?.find((node) => node.id === id);
          const actualNode = actual.children?.find((node) => node.id === id);
          expect([actualNode?.x, actualNode?.y]).toEqual([expectedNode?.x, expectedNode?.y]);
        }
        const flowCoordinate = direction === "RIGHT" || direction === "LEFT" ? "x" : "y";
        expect(actual.children?.find((node) => node.id === "target")?.[flowCoordinate]).toEqual(
          expected.children?.find((node) => node.id === "target")?.[flowCoordinate],
        );
        const crossCoordinate = flowCoordinate === "x" ? "y" : "x";
        expect(
          actual.children?.find((node) => node.id === "target")?.[crossCoordinate],
        ).toBeCloseTo(
          expected.children?.find((node) => node.id === "target")?.[crossCoordinate] ?? Number.NaN,
          12,
        );
        for (const expectedEdge of expected.edges ?? []) {
          const actualEdge = actual.edges?.find((edge) => edge.id === expectedEdge.id);
          const expectedPoints = (expectedEdge.sections ?? []).flatMap((section) => [
            section.startPoint,
            ...(section.bendPoints ?? []),
            section.endPoint,
          ]);
          const actualPoints = (actualEdge?.sections ?? []).flatMap((section) => [
            section.startPoint,
            ...(section.bendPoints ?? []),
            section.endPoint,
          ]);
          expect(actualPoints).toHaveLength(expectedPoints.length);
          for (const [index, expectedPoint] of expectedPoints.entries()) {
            expect(actualPoints[index]?.x).toBeCloseTo(expectedPoint.x, 12);
            expect(actualPoints[index]?.y).toBeCloseTo(expectedPoint.y, 12);
          }
        }
      });
    }
  }
});

describe("ELK feedback-edge parity", () => {
  it("routes a reversed cycle edge around all nodes", async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.feedbackEdges": "true",
      },
      children: ["a", "b", "c"].map((id) => ({ id, width: 30, height: 20 })),
      edges: [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ].map(([source, target], index) => ({
        id: `edge-${index}`,
        sources: [source!],
        targets: [target!],
      })),
    };
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    expect(actual.children?.map(({ x, y }) => [x, y])).toEqual(
      expected.children?.map(({ x, y }) => [x, y]),
    );
    expect(actual.edges?.map((edge) => edge.sections)).toEqual(
      expected.edges?.map((edge) => edge.sections),
    );
  });

  it("routes a reversed fixed-side edge outside the graph without feedbackEdges", async () => {
    const node = (id: string): ElkNode => ({
      id,
      width: 10,
      height: 3,
      layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
      ports: [
        {
          id: `${id}-out`,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": "EAST" },
        },
        {
          id: `${id}-in`,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": "WEST" },
        },
      ],
    });
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.padding": "[top=2,left=2,bottom=2,right=2]",
        "elk.spacing.nodeNode": "3",
        "elk.spacing.edgeNode": "2",
        "elk.spacing.edgeEdge": "1",
        "elk.spacing.edgeLabel": "1",
        "elk.layered.spacing.nodeNodeBetweenLayers": "8",
        "elk.layered.spacing.edgeNodeBetweenLayers": "3",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "2",
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        "elk.layered.unnecessaryBendpoints": "true",
      },
      children: [node("a"), node("b")],
      edges: [
        {
          id: "ab",
          sources: ["a-out"],
          targets: ["b-in"],
          labels: [
            {
              id: "ab-label",
              text: "NEXT",
              width: 4,
              height: 1,
              layoutOptions: {
                "elk.edgeLabels.inline": "true",
                "elk.edgeLabels.placement": "CENTER",
              },
            },
          ],
        },
        {
          id: "ba",
          sources: ["b-out"],
          targets: ["a-in"],
          labels: [
            {
              id: "ba-label",
              text: "BACK",
              width: 4,
              height: 1,
              layoutOptions: {
                "elk.edgeLabels.inline": "true",
                "elk.edgeLabels.placement": "CENTER",
              },
            },
          ],
        },
      ],
    };
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));

    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    expect(
      actual.children?.map(({ x, y, ports }) => [x, y, ports?.map((port) => [port.x, port.y])]),
    ).toEqual(
      expected.children?.map(({ x, y, ports }) => [x, y, ports?.map((port) => [port.x, port.y])]),
    );
    const actualForward = actual.edges?.find((edge) => edge.id === "ab")?.sections?.[0];
    const expectedForward = expected.edges?.find((edge) => edge.id === "ab")?.sections?.[0];
    expect(actualForward).toEqual(expectedForward);
    const actualFeedback = actual.edges?.find((edge) => edge.id === "ba")?.sections?.[0];
    const expectedFeedback = expected.edges?.find((edge) => edge.id === "ba")?.sections?.[0];
    expect(actualFeedback?.startPoint).toEqual(expectedFeedback?.startPoint);
    expect(actualFeedback?.endPoint).toEqual(expectedFeedback?.endPoint);
    const feedbackPoints = [
      actualFeedback!.startPoint,
      ...(actualFeedback?.bendPoints ?? []),
      actualFeedback!.endPoint,
    ];
    for (let index = 1; index < feedbackPoints.length; index++) {
      const previous = feedbackPoints[index - 1]!;
      const point = feedbackPoints[index]!;
      expect(previous.x === point.x || previous.y === point.y).toBe(true);
    }
    const nodes = actual.children ?? [];
    const minimumNodeX = Math.min(...nodes.map((child) => child.x ?? 0));
    const maximumNodeX = Math.max(...nodes.map((child) => (child.x ?? 0) + (child.width ?? 0)));
    const maximumNodeY = Math.max(...nodes.map((child) => (child.y ?? 0) + (child.height ?? 0)));
    expect(Math.min(...feedbackPoints.map((point) => point.x))).toBeLessThan(minimumNodeX);
    expect(Math.max(...feedbackPoints.map((point) => point.x))).toBeGreaterThan(maximumNodeX);
    expect(Math.max(...feedbackPoints.map((point) => point.y))).toBeGreaterThan(maximumNodeY);
    const feedbackLabel = actual.edges?.find((edge) => edge.id === "ba")?.labels?.[0];
    expect((feedbackLabel?.y ?? 0) + (feedbackLabel?.height ?? 0)).toBeLessThanOrEqual(
      Math.max(...feedbackPoints.map((point) => point.y)),
    );
  });

  it("keeps a vertical fixed-side cycle straight and routes its long feedback edge outside", async () => {
    const node = (id: string, width: number): ElkNode => ({
      id,
      width,
      height: 3,
      layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
      ports: [
        {
          id: `${id}-out`,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": "SOUTH" },
        },
        {
          id: `${id}-in`,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": "NORTH" },
        },
      ],
    });
    const edge = (id: string, source: string, target: string, text: string): ElkEdge => ({
      id,
      sources: [`${source}-out`],
      targets: [`${target}-in`],
      labels: [
        {
          id: `${id}-label`,
          text,
          width: text.length,
          height: 1,
          layoutOptions: {
            "elk.edgeLabels.inline": "true",
            "elk.edgeLabels.placement": "CENTER",
          },
        },
      ],
    });
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.padding": "[top=2,left=2,bottom=2,right=2]",
        "elk.spacing.nodeNode": "3",
        "elk.spacing.edgeNode": "2",
        "elk.spacing.edgeLabel": "1",
        "elk.layered.spacing.nodeNodeBetweenLayers": "4",
        "elk.layered.spacing.edgeNodeBetweenLayers": "3",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "2",
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
        "elk.layered.crossingMinimization.greedySwitch.type": "TWO_SIDED",
        "elk.layered.crossingMinimization.semiInteractive": "false",
        "elk.layered.considerModelOrder.strategy": "NONE",
        "elk.layered.compaction.connectedComponents": "true",
        "elk.layered.compaction.postCompaction.constraints": "SCANLINE",
        "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        "elk.layered.nodePlacement.favorStraightEdges": "true",
        "elk.layered.highDegreeNodes.treatment": "true",
        "elk.layered.highDegreeNodes.threshold": "6",
        "elk.layered.highDegreeNodes.treeHeight": "3",
        "elk.layered.thoroughness": "10",
        "elk.layered.mergeEdges": "false",
        "elk.layered.unnecessaryBendpoints": "true",
      },
      children: [node("green", 7), node("yellow", 8), node("red", 5)],
      edges: [
        edge("green-yellow", "green", "yellow", "after 1500"),
        edge("yellow-red", "yellow", "red", "after 500"),
        edge("red-green", "red", "green", "after 1500"),
      ],
    };
    // Pinned elkjs 0.11.1 rejects this graph; revisit if an upgrade fixes or rewords the error.
    await expect(new OracleELK().layout(structuredClone(input) as never)).rejects.toThrow(
      "Invalid hitboxes for scanline constraint calculation",
    );
    const actual = await new NativeELK().layout(structuredClone(input));
    const repeated = await new NativeELK().layout(structuredClone(input));

    expect(repeated).toEqual(actual);
    expect(actual.children?.map((child) => child.y)).toEqual(
      [...(actual.children ?? [])].map((child) => child.y).sort((left, right) => left! - right!),
    );
    for (const id of ["green-yellow", "yellow-red"]) {
      const section = required(
        actual.edges?.find((candidate) => candidate.id === id)?.sections?.[0],
        `${id} section`,
      );
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      expect(new Set(points.map((point) => point.x)).size).toBe(1);
      expect(section.startPoint.y).toBeLessThan(section.endPoint.y);
    }
    const feedback = required(
      actual.edges?.find((candidate) => candidate.id === "red-green"),
      "feedback edge",
    );
    const section = required(feedback.sections?.[0], "feedback section");
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!;
      const point = points[index]!;
      expect(previous.x === point.x || previous.y === point.y).toBe(true);
    }
    const maximumNodeX = Math.max(
      ...(actual.children ?? []).map((child) => (child.x ?? 0) + (child.width ?? 0)),
    );
    expect(Math.max(...points.map((point) => point.x))).toBeGreaterThan(maximumNodeX);
    const label = required(feedback.labels?.[0], "feedback label");
    expect(label.x).toBeGreaterThan(Math.max(...points.map((point) => point.x)));
  });

  it("keeps a targetless sink after a node that also has a fixed-side self loop", async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.padding": "[top=2,left=2,bottom=2,right=2]",
        "elk.spacing.nodeNode": "3",
        "elk.spacing.edgeNode": "2",
        "elk.spacing.edgeLabel": "1",
        "elk.layered.spacing.nodeNodeBetweenLayers": "4",
        "elk.layered.spacing.edgeNodeBetweenLayers": "3",
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        "elk.layered.nodePlacement.favorStraightEdges": "true",
        "elk.layered.unnecessaryBendpoints": "true",
      },
      children: [
        {
          id: "idle",
          width: 6,
          height: 3,
          layoutOptions: {
            "elk.portConstraints": "FIXED_SIDE",
            "elk.layered.edgeRouting.selfLoopDistribution": "NORTH",
            "elk.layered.edgeRouting.selfLoopOrdering": "SEQUENCED",
          },
          ports: [
            {
              id: "retry-source",
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": "SOUTH" },
            },
            {
              id: "retry-target",
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": "NORTH" },
            },
            {
              id: "ping-source",
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": "SOUTH" },
            },
          ],
        },
        {
          id: "sink",
          width: 1,
          height: 1,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            {
              id: "ping-target",
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": "NORTH" },
            },
          ],
        },
      ],
      edges: [
        {
          id: "retry",
          sources: ["retry-source"],
          targets: ["retry-target"],
          labels: [{ id: "retry-label", text: "RETRY", width: 5, height: 1 }],
        },
        {
          id: "ping",
          sources: ["ping-source"],
          targets: ["ping-target"],
          labels: [{ id: "ping-label", text: "PING", width: 4, height: 1 }],
        },
      ],
    };
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    const idle = required(
      actual.children?.find((node) => node.id === "idle"),
      "idle node",
    );
    const sink = required(
      actual.children?.find((node) => node.id === "sink"),
      "sink node",
    );
    expect(idle.y).toBe(expected.children?.find((node) => node.id === "idle")?.y);
    expect(sink.y).toBeGreaterThan((idle.y ?? 0) + (idle.height ?? 0));

    const pingSection = required(
      actual.edges?.find((edge) => edge.id === "ping")?.sections?.[0],
      "ping section",
    );
    expect(pingSection.startPoint.x).toBe(pingSection.endPoint.x);
    expect(pingSection.bendPoints ?? []).toEqual([]);
    expect(pingSection.startPoint.y).toBeLessThan(pingSection.endPoint.y);

    const retry = required(
      actual.edges?.find((edge) => edge.id === "retry"),
      "retry edge",
    );
    const retrySection = required(retry.sections?.[0], "retry section");
    const retryPoints = [
      retrySection.startPoint,
      ...(retrySection.bendPoints ?? []),
      retrySection.endPoint,
    ];
    for (let index = 1; index < retryPoints.length; index++) {
      const previous = retryPoints[index - 1]!;
      const point = retryPoints[index]!;
      expect(previous.x === point.x || previous.y === point.y).toBe(true);
    }
    const nodeRects = actual.children ?? [];
    expect(Math.min(...retryPoints.map((point) => point.y))).toBeLessThan(
      Math.min(...nodeRects.map((node) => node.y ?? 0)),
    );
    expect(Math.max(...retryPoints.map((point) => point.y))).toBeGreaterThan(
      Math.max(...nodeRects.map((node) => (node.y ?? 0) + (node.height ?? 0))),
    );
    expect(Math.max(...retryPoints.map((point) => point.x))).toBeGreaterThan(
      Math.max(...nodeRects.map((node) => (node.x ?? 0) + (node.width ?? 0))),
    );
    const retryLabel = required(retry.labels?.[0], "retry label");
    expect(retryLabel.x).toBeGreaterThanOrEqual(
      Math.max(...nodeRects.map((node) => (node.x ?? 0) + (node.width ?? 0))),
    );
  });

  it("routes a same-side fixed-port self loop through its declared side", async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeSelfLoop": "10",
      },
      children: [
        {
          id: "source",
          width: 180,
          height: 96,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            {
              id: "self-source",
              width: 20,
              height: 20,
              layoutOptions: { "elk.port.side": "EAST" },
            },
            {
              id: "self-target",
              width: 20,
              height: 20,
              layoutOptions: { "elk.port.side": "EAST" },
            },
            {
              id: "second-source",
              width: 20,
              height: 20,
              layoutOptions: { "elk.port.side": "EAST" },
            },
            {
              id: "second-target",
              width: 20,
              height: 20,
              layoutOptions: { "elk.port.side": "EAST" },
            },
            {
              id: "third-source",
              width: 20,
              height: 20,
              layoutOptions: { "elk.port.side": "EAST" },
            },
            {
              id: "third-target",
              width: 20,
              height: 20,
              layoutOptions: { "elk.port.side": "EAST" },
            },
          ],
        },
      ],
      edges: [
        {
          id: "self",
          sources: ["self-source"],
          targets: ["self-target"],
          labels: [
            {
              id: "self-label",
              text: "lifecycle",
              width: 180,
              height: 48,
              layoutOptions: {
                "elk.edgeLabels.inline": "true",
                "elk.edgeLabels.placement": "CENTER",
              },
            },
          ],
        },
        {
          id: "second",
          sources: ["second-source"],
          targets: ["second-target"],
          labels: [
            {
              id: "second-label",
              text: "second lifecycle",
              width: 180,
              height: 36,
              layoutOptions: {
                "elk.edgeLabels.inline": "true",
                "elk.edgeLabels.placement": "CENTER",
              },
            },
          ],
        },
        {
          id: "third",
          sources: ["third-source"],
          targets: ["third-target"],
          labels: [
            {
              id: "third-label",
              text: "third lifecycle",
              width: 180,
              height: 36,
              layoutOptions: {
                "elk.edgeLabels.inline": "true",
                "elk.edgeLabels.placement": "CENTER",
              },
            },
          ],
        },
      ],
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const node = required(actual.children?.[0], "self-loop node");
    const sourcePort = required(
      node.ports?.find((port) => port.id === "self-source"),
      "self-loop source port",
    );
    const targetPort = required(
      node.ports?.find((port) => port.id === "self-target"),
      "self-loop target port",
    );
    const edge = required(actual.edges?.[0], "self-loop edge");
    const section = required(edge.sections?.[0], "self-loop section");
    const sourceAnchorX = (node.x ?? 0) + (sourcePort.x ?? 0) + (sourcePort.width ?? 0);
    const targetAnchorX = (node.x ?? 0) + (targetPort.x ?? 0) + (targetPort.width ?? 0);
    expect(section.startPoint.x).toBe(sourceAnchorX);
    expect(section.endPoint.x).toBe(targetAnchorX);
    expect(Math.max(...(section.bendPoints ?? []).map((point) => point.x))).toBeGreaterThan(
      (node.x ?? 0) + (node.width ?? 0),
    );
    const label = required(edge.labels?.[0], "self-loop label");
    const labelOverlapsNode =
      (label.x ?? 0) < (node.x ?? 0) + (node.width ?? 0) &&
      (label.x ?? 0) + (label.width ?? 0) > (node.x ?? 0) &&
      (label.y ?? 0) < (node.y ?? 0) + (node.height ?? 0) &&
      (label.y ?? 0) + (label.height ?? 0) > (node.y ?? 0);
    expect(labelOverlapsNode).toBe(false);
    expect(label.y).toBeGreaterThanOrEqual(
      Math.max(
        ...(actual.children ?? []).map((candidate) => (candidate.y ?? 0) + (candidate.height ?? 0)),
      ),
    );
    const labels = (actual.edges ?? []).map((candidate) =>
      required(candidate.labels?.[0], `${candidate.id} label`),
    );
    for (const [index, left] of labels.entries()) {
      for (const right of labels.slice(index + 1)) {
        const overlaps =
          (left.x ?? 0) < (right.x ?? 0) + (right.width ?? 0) &&
          (left.x ?? 0) + (left.width ?? 0) > (right.x ?? 0) &&
          (left.y ?? 0) < (right.y ?? 0) + (right.height ?? 0) &&
          (left.y ?? 0) + (left.height ?? 0) > (right.y ?? 0);
        expect(overlaps).toBe(false);
      }
    }
    const farTracks = (actual.edges ?? []).map((candidate) =>
      Math.max(
        ...required(candidate.sections?.[0], `${candidate.id} section`).bendPoints!.map(
          (point) => point.x,
        ),
      ),
    );
    expect(new Set(farTracks).size).toBe(farTracks.length);
  });

  it("reserves one north-loop margin for nodes in the same layer", async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.separateConnectedComponents": "false",
        "elk.spacing.nodeSelfLoop": "10",
      },
      children: ["left", "right", "target"].map((id) => ({
        id,
        width: 40,
        height: 20,
      })),
      edges: [
        { id: "left-loop", sources: ["left"], targets: ["left"] },
        { id: "right-loop", sources: ["right"], targets: ["right"] },
        { id: "left-target", sources: ["left"], targets: ["target"] },
        { id: "right-target", sources: ["right"], targets: ["target"] },
      ],
    };

    const actual = await new NativeELK().layout(structuredClone(input));
    const left = required(
      actual.children?.find((node) => node.id === "left"),
      "left node",
    );
    const right = required(
      actual.children?.find((node) => node.id === "right"),
      "right node",
    );

    expect(left.y).toBe(right.y);
  });
});
