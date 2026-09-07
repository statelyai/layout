import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkEdge, type ElkNode } from "../../src/elkjs";

type Routing = "ORTHOGONAL" | "POLYLINE" | "SPLINES";

const overlaps = (
  left: { x?: number; y?: number; width?: number; height?: number },
  right: { x?: number; y?: number; width?: number; height?: number },
): boolean =>
  (left.x ?? 0) < (right.x ?? 0) + (right.width ?? 0) &&
  (left.x ?? 0) + (left.width ?? 0) > (right.x ?? 0) &&
  (left.y ?? 0) < (right.y ?? 0) + (right.height ?? 0) &&
  (left.y ?? 0) + (left.height ?? 0) > (right.y ?? 0);

const labels = (graph: ElkNode) => (graph.edges ?? []).flatMap((edge) => edge.labels ?? []);

function feedbackGraph(routing: Routing, reverseEdges = false): ElkNode {
  const edge = (
    id: string,
    source: string,
    target: string,
    placement: "CENTER" | "HEAD" | "TAIL" = "CENTER",
  ): ElkEdge => ({
    id,
    sources: [source],
    targets: [target],
    labels: [
      {
        id: `${id}-label`,
        width: 104,
        height: 40,
        layoutOptions: {
          "elk.edgeLabels.inline": "true",
          "elk.edgeLabels.placement": placement,
        },
      },
    ],
  });
  const edges = [
    edge("ab", "a", "b"),
    edge("bc", "b", "c"),
    edge("cd", "c", "d"),
    edge("da", "d", "a"),
    edge("ca", "c", "a", "HEAD"),
    edge("db", "d", "b"),
  ];
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": routing,
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.spacing.edgeEdge": "10",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
    },
    children: ["a", "b", "c", "d"].map((id) => ({ id, width: 120, height: 64 })),
    edges: reverseEdges ? edges.toReversed() : edges,
  };
}

describe("elkjs compatibility: exterior label separation", () => {
  it("keeps every orthogonal exterior label clear of all label types", async () => {
    const result = await new NativeELK().layout(feedbackGraph("ORTHOGONAL"));
    const resultLabels = labels(result);
    for (const [index, label] of resultLabels.entries()) {
      expect(
        resultLabels.some((candidate, candidateIndex) =>
          candidateIndex === index ? false : overlaps(label, candidate),
        ),
        String(label.id),
      ).toBe(false);
    }
  });

  it("keeps equivalent edge orders collision-free", async () => {
    const elk = new NativeELK();
    const [forward, reverse] = await Promise.all([
      elk.layout(feedbackGraph("ORTHOGONAL")),
      elk.layout(feedbackGraph("ORTHOGONAL", true)),
    ]);
    for (const result of [forward, reverse]) {
      const resultLabels = labels(result);
      for (const label of resultLabels.filter((candidate) =>
        ["da-label", "db-label"].includes(String(candidate.id)),
      )) {
        expect(
          resultLabels.some((candidate) =>
            candidate.id === label.id ? false : overlaps(label, candidate),
          ),
          String(label.id),
        ).toBe(false);
      }
    }
  });

  it.each(["POLYLINE", "SPLINES"] as const)(
    "retains finite %s geometry within the real ELK graph envelope",
    async (routing) => {
      const input = feedbackGraph(routing);
      const [oracle, native] = await Promise.all([
        new OracleELK().layout(structuredClone(input) as never) as Promise<ElkNode>,
        new NativeELK().layout(structuredClone(input)),
      ]);
      for (const graph of [oracle, native]) {
        expect(Number.isFinite(graph.width)).toBe(true);
        expect(Number.isFinite(graph.height)).toBe(true);
        expect(labels(graph)).toHaveLength(labels(input).length);
        for (const edge of graph.edges ?? []) {
          expect(edge.sections?.length, String(edge.id)).toBeGreaterThan(0);
          for (const label of edge.labels ?? []) {
            expect(Number.isFinite(label.x), String(label.id)).toBe(true);
            expect(Number.isFinite(label.y), String(label.id)).toBe(true);
          }
        }
      }
      const areaRatio =
        ((native.width ?? 0) * (native.height ?? 0)) / ((oracle.width ?? 0) * (oracle.height ?? 0));
      expect(areaRatio).toBeGreaterThan(0.2);
      expect(areaRatio).toBeLessThan(5);
    },
  );
});
