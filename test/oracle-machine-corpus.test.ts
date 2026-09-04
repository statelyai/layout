import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkEdge, type ElkNode } from "../src/elkjs";

type Direction = "DOWN" | "RIGHT";

interface MachineCase {
  name: string;
  graph: (direction: Direction) => ElkNode;
  forward: readonly (readonly [string, string])[];
}

const label = (id: string, width = 88): NonNullable<ElkEdge["labels"]>[number] => ({
  id: `${id}-label`,
  width,
  height: 32,
  layoutOptions: { "elk.edgeLabels.inline": "true" },
});

const edge = (id: string, source: string, target: string, labelled = true): ElkEdge => ({
  id,
  sources: [source],
  targets: [target],
  ...(labelled ? { labels: [label(id)] } : {}),
});

const options = (direction: Direction): Record<string, string> => ({
  "elk.algorithm": "layered",
  "elk.direction": direction,
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
  "elk.layered.layering.strategy": "INTERACTIVE",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.spacing.nodeNode": "48",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
});

const machineCases: readonly MachineCase[] = [
  {
    name: "branching approval workflow with retry and terminal self-loop",
    forward: [
      ["intake", "validate"],
      ["validate", "authorize"],
      ["validate", "manual"],
      ["manual", "authorize"],
      ["authorize", "fulfill"],
      ["fulfill", "notify"],
    ],
    graph: (direction) => ({
      id: "approval",
      layoutOptions: options(direction),
      children: [
        { id: "intake", width: 132, height: 68 },
        { id: "validate", width: 164, height: 76 },
        { id: "manual", width: 214, height: 104 },
        { id: "authorize", width: 176, height: 76 },
        { id: "failed", width: 148, height: 68 },
        { id: "fulfill", width: 156, height: 72 },
        { id: "notify", width: 144, height: 68 },
      ],
      edges: [
        edge("submit", "intake", "validate"),
        edge("valid", "validate", "authorize"),
        edge("review", "validate", "manual", false),
        edge("approve", "manual", "authorize"),
        edge("reject", "authorize", "failed"),
        edge("retry", "failed", "validate"),
        edge("ship", "authorize", "fulfill"),
        edge("complete", "fulfill", "notify"),
        edge("refresh", "notify", "notify"),
      ],
    }),
  },
  {
    name: "dense fan-out and fan-in workflow with long edges",
    forward: [
      ["start", "split-a"],
      ["start", "split-b"],
      ["split-a", "join"],
      ["split-b", "join"],
      ["join", "finish"],
    ],
    graph: (direction) => ({
      id: "dense",
      layoutOptions: options(direction),
      children: [
        { id: "start", width: 110, height: 64 },
        { id: "split-a", width: 152, height: 72 },
        { id: "split-b", width: 188, height: 88 },
        { id: "side-a", width: 136, height: 64 },
        { id: "side-b", width: 168, height: 76 },
        { id: "join", width: 180, height: 84 },
        { id: "audit", width: 124, height: 64 },
        { id: "finish", width: 146, height: 68 },
      ],
      edges: [
        edge("to-a", "start", "split-a"),
        edge("to-b", "start", "split-b"),
        edge("a-side", "split-a", "side-a", false),
        edge("b-side", "split-b", "side-b", false),
        edge("a-join", "split-a", "join"),
        edge("b-join", "split-b", "join"),
        edge("side-a-join", "side-a", "join", false),
        edge("side-b-join", "side-b", "join", false),
        edge("audit", "start", "audit"),
        edge("audit-join", "audit", "join", false),
        edge("done", "join", "finish"),
      ],
    }),
  },
  {
    name: "two independent cyclic components",
    forward: [
      ["a0", "a1"],
      ["a1", "a2"],
      ["b0", "b1"],
      ["b1", "b2"],
    ],
    graph: (direction) => ({
      id: "components",
      layoutOptions: {
        ...options(direction),
        "elk.separateConnectedComponents": "true",
      },
      children: [
        { id: "a0", width: 120, height: 64 },
        { id: "a1", width: 176, height: 80 },
        { id: "a2", width: 132, height: 68 },
        { id: "b0", width: 148, height: 72 },
        { id: "b1", width: 196, height: 92 },
        { id: "b2", width: 126, height: 64 },
      ],
      edges: [
        edge("a-next", "a0", "a1"),
        edge("a-done", "a1", "a2"),
        edge("a-reset", "a2", "a0"),
        edge("b-next", "b0", "b1"),
        edge("b-done", "b1", "b2"),
        edge("b-reset", "b2", "b0"),
      ],
    }),
  },
  {
    name: "compound state with internal cycle and cross-hierarchy transitions",
    forward: [
      ["queued", "worker"],
      ["worker", "done"],
    ],
    graph: (direction) => ({
      id: "compound",
      layoutOptions: {
        ...options(direction),
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      },
      children: [
        { id: "queued", width: 132, height: 68 },
        {
          id: "worker",
          width: 260,
          height: 180,
          layoutOptions: {
            "elk.direction": direction === "DOWN" ? "RIGHT" : "DOWN",
            "elk.padding": "[top=44,left=32,bottom=32,right=32]",
          },
          children: [
            { id: "fetch", width: 112, height: 60 },
            { id: "process", width: 154, height: 72 },
            { id: "recover", width: 132, height: 64 },
          ],
          edges: [
            edge("fetch-process", "fetch", "process"),
            edge("process-recover", "process", "recover"),
            edge("recover-fetch", "recover", "fetch"),
          ],
        },
        { id: "done", width: 128, height: 64 },
        { id: "cancelled", width: 164, height: 72 },
      ],
      edges: [
        edge("start", "queued", "worker"),
        edge("finish", "worker", "done"),
        edge("cancel", "fetch", "cancelled"),
      ],
    }),
  },
];

interface AbsoluteNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function absoluteNodes(root: ElkNode): Map<string, AbsoluteNode> {
  const result = new Map<string, AbsoluteNode>();
  const visit = (node: ElkNode, parentX: number, parentY: number) => {
    const x = parentX + (node.x ?? 0);
    const y = parentY + (node.y ?? 0);
    if (node !== root) {
      result.set(String(node.id), {
        id: String(node.id),
        x,
        y,
        width: node.width ?? 0,
        height: node.height ?? 0,
      });
    }
    for (const child of node.children ?? []) visit(child, x, y);
  };
  visit(root, 0, 0);
  return result;
}

function allEdges(root: ElkNode): ElkEdge[] {
  return [...(root.edges ?? []), ...(root.children ?? []).flatMap((child) => allEdges(child))];
}

function expectFiniteGeometry(result: ElkNode): void {
  expect(Number.isFinite(result.width)).toBe(true);
  expect(Number.isFinite(result.height)).toBe(true);
  for (const node of absoluteNodes(result).values()) {
    for (const value of [node.x, node.y, node.width, node.height]) {
      expect(Number.isFinite(value), node.id).toBe(true);
    }
  }
  for (const edge of allEdges(result)) {
    expect(edge.sections?.length, String(edge.id)).toBeGreaterThan(0);
    for (const section of edge.sections ?? []) {
      for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
        expect(Number.isFinite(point.x), String(edge.id)).toBe(true);
        expect(Number.isFinite(point.y), String(edge.id)).toBe(true);
      }
    }
  }
}

describe("complex state-machine ELK semi-equivalence corpus", () => {
  for (const machine of machineCases) {
    for (const direction of ["DOWN", "RIGHT"] as const) {
      it(`${machine.name} (${direction})`, async () => {
        const input = machine.graph(direction);
        const [oracle, native] = await Promise.all([
          new OracleELK().layout(structuredClone(input) as never) as Promise<ElkNode>,
          new NativeELK().layout(structuredClone(input)),
        ]);
        expectFiniteGeometry(oracle);
        expectFiniteGeometry(native);

        const oracleNodes = absoluteNodes(oracle);
        const nativeNodes = absoluteNodes(native);
        expect([...nativeNodes.keys()].sort()).toEqual([...oracleNodes.keys()].sort());
        expect(
          allEdges(native)
            .map((candidate) => candidate.id)
            .sort(),
        ).toEqual(
          allEdges(oracle)
            .map((candidate) => candidate.id)
            .sort(),
        );

        const primaryCenter = (node: AbsoluteNode) =>
          direction === "DOWN" ? node.y + node.height / 2 : node.x + node.width / 2;
        for (const [sourceId, targetId] of machine.forward) {
          expect(primaryCenter(oracleNodes.get(sourceId)!)).toBeLessThan(
            primaryCenter(oracleNodes.get(targetId)!),
          );
          expect(primaryCenter(nativeNodes.get(sourceId)!)).toBeLessThan(
            primaryCenter(nativeNodes.get(targetId)!),
          );
        }

        const oracleArea = (oracle.width ?? 0) * (oracle.height ?? 0);
        const nativeArea = (native.width ?? 0) * (native.height ?? 0);
        expect(nativeArea / oracleArea).toBeGreaterThan(0.2);
        expect(nativeArea / oracleArea).toBeLessThan(5);

        const oracleLabels = allEdges(oracle).flatMap((candidate) => candidate.labels ?? []);
        const nativeLabels = allEdges(native).flatMap((candidate) => candidate.labels ?? []);
        expect(nativeLabels).toHaveLength(oracleLabels.length);
        for (const item of nativeLabels) {
          expect(Number.isFinite(item.x), String(item.id)).toBe(true);
          expect(Number.isFinite(item.y), String(item.id)).toBe(true);
        }
      });
    }
  }
});
