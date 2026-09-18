import { describe, expect, it } from "vitest";
import ELK from "../src/elkjs";
import legacyFixture from "./fixtures/email-drafter-viz.json";
import stateAnchorFixture from "./fixtures/email-drafter-state-anchors.json";

describe.each([
  { name: "legacy invoke ports", fixture: legacyFixture },
  { name: "state anchors", fixture: stateAnchorFixture },
])("email drafter Viz geometry ($name)", ({ fixture }) => {
  it.each(["DOWN", "UP", "RIGHT", "LEFT"])(
    "separates states and keeps labels between endpoints (%s)",
    async (direction) => {
      const input = structuredClone(fixture);
      input.layoutOptions["elk.direction"] = direction;
      const result = await new ELK().layout(input);
      const nodes = result.children!;
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          expect(
            a.x! >= b.x! + b.width! ||
              b.x! >= a.x! + a.width! ||
              a.y! >= b.y! + b.height! ||
              b.y! >= a.y! + a.height!,
            `${a.id} / ${b.id}`,
          ).toBe(true);
        }
      const owners = new Map(
        nodes.flatMap((node) => [
          [node.id, node] as const,
          ...(node.ports ?? []).map((port) => [port.id, node] as const),
        ]),
      );
      const horizontal = direction === "LEFT" || direction === "RIGHT";
      const axis = horizontal ? "x" : "y";
      const size = horizontal ? "width" : "height";
      for (const edge of result.edges!) {
        const source = owners.get(edge.sources![0])!;
        const target = owners.get(edge.targets![0])!;
        if (source === target) continue;
        const start = Math.min(source[axis]! + source[size]!, target[axis]! + target[size]!);
        const end = Math.max(source[axis]!, target[axis]!);
        for (const label of edge.labels ?? []) {
          expect(label[axis], `${edge.id} starts after an endpoint`).toBeGreaterThanOrEqual(start);
          expect(
            label[axis]! + label[size]!,
            `${edge.id} ends before an endpoint`,
          ).toBeLessThanOrEqual(end);
        }
      }
    },
  );
});

it("allows a self-loop on a FIRST_SEPARATE initial state", async () => {
  const result = await new ELK().layout({
    id: "root",
    children: [
      {
        id: "initial",
        width: 200,
        height: 100,
        layoutOptions: { "elk.layered.layering.layerConstraint": "FIRST_SEPARATE" },
      },
    ],
    edges: [
      {
        id: "retry",
        sources: ["initial"],
        targets: ["initial"],
        labels: [{ id: "retry-label", width: 120, height: 60, text: "RETRY" }],
      },
    ],
  });
  expect(Number.isFinite(result.children![0]!.x)).toBe(true);
  expect(Number.isFinite(result.edges![0]!.labels![0]!.y)).toBe(true);
});

it.each([200, 1200])("reserves an inline self-loop label above a %s-wide owner", async (width) => {
  const result = await new ELK().layout({
    id: "root",
    layoutOptions: { "elk.direction": "DOWN" },
    children: [{ id: "owner", width, height: 100 }],
    edges: [
      {
        id: "done",
        sources: ["owner"],
        targets: ["owner"],
        labels: [
          {
            id: "done-label",
            text: "DONE",
            width: 180,
            height: 48,
            layoutOptions: { "elk.edgeLabels.inline": true },
          },
        ],
      },
    ],
  });
  const owner = result.children![0]!;
  const label = result.edges![0]!.labels![0]!;
  expect(label.y! + label.height!).toBeLessThanOrEqual(owner.y!);
});

it.each(["label", "edge"])(
  "keeps inline compound-to-descendant labels clear with %s options",
  async (optionOwner) => {
    const { default: input } = await import("./fixtures/cross-hierarchy-viz.json");
    const fixture = structuredClone(input);
    if (optionOwner === "edge")
      for (const edge of fixture.edges ?? []) {
        for (const label of edge.labels ?? []) {
          Object.assign((edge.layoutOptions ??= {}), label.layoutOptions);
          label.layoutOptions = {};
        }
      }
    const result = await new ELK().layout(fixture);
    const owner = result.children!.find((node) => node.id === "parent")!;
    const headers: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    const collectHeaders = (node: import("../src/elkjs").ElkNode, offsetX = 0, offsetY = 0) => {
      const x = offsetX + (node.x ?? 0);
      const y = offsetY + (node.y ?? 0);
      if (node.id !== result.id) {
        const minimum = String(node.layoutOptions?.["elk.nodeSize.minimum"] ?? "").match(
          /\(([^,]+),([^)]+)\)/,
        );
        headers.push({
          id: String(node.id),
          x,
          y,
          width: minimum ? Number(minimum[1]) : node.width!,
          height: minimum ? Number(minimum[2]) : node.height!,
        });
      }
      node.children?.forEach((child) => collectHeaders(child, x, y));
    };
    collectHeaders(result);
    for (const edge of result.edges!)
      for (const label of edge.labels ?? []) {
        for (const header of headers)
          expect(
            label.x! >= header.x + header.width ||
              label.x! + label.width! <= header.x ||
              label.y! >= header.y + header.height ||
              label.y! + label.height! <= header.y,
            `${edge.id} / ${header.id}`,
          ).toBe(true);
      }
    for (const id of ["parent-child", "child-parent"]) {
      const edge = result.edges!.find((edge) => edge.id === id)!;
      const label = edge.labels![0]!;
      expect(label.y! + label.height!).toBeLessThan(owner.y!);
      expect(edge.sections![0]!.bendPoints).toHaveLength(2);
    }
  },
);

it.each(["NORTH_SOUTH", "EQUALLY"])(
  "reserves tall south-loop labels between ranks (%s)",
  async (distribution) => {
    const result = await new ELK().layout({
      id: "root",
      layoutOptions: { "elk.direction": "DOWN", "elk.spacing.nodeNodeBetweenLayers": 30 },
      children: [
        {
          id: "owner",
          width: 200,
          height: 100,
          layoutOptions: { "elk.layered.edgeRouting.selfLoopDistribution": distribution },
        },
        { id: "next", width: 200, height: 100 },
      ],
      edges: [
        { id: "forward", sources: ["owner"], targets: ["next"] },
        ...[0, 1].map((i) => ({
          id: `loop-${i}`,
          sources: ["owner"],
          targets: ["owner"],
          labels: [
            {
              id: `label-${i}`,
              width: 180,
              height: 140,
              layoutOptions: { "elk.edgeLabels.inline": true },
            },
          ],
        })),
      ],
    });
    const next = result.children!.find((node) => node.id === "next")!;
    const label = result.edges!.find((edge) => edge.id === "loop-1")!.labels![0]!;
    expect(label.y! + label.height!).toBeLessThanOrEqual(next.y!);
  },
);

it("reserves tall EQUALLY north-loop labels after a preceding rank", async () => {
  const result = await new ELK().layout({
    id: "root",
    layoutOptions: { "elk.direction": "DOWN" },
    children: [
      { id: "previous", width: 200, height: 100 },
      {
        id: "owner",
        width: 200,
        height: 100,
        layoutOptions: { "elk.layered.edgeRouting.selfLoopDistribution": "EQUALLY" },
      },
    ],
    edges: [
      { id: "forward", sources: ["previous"], targets: ["owner"] },
      {
        id: "loop",
        sources: ["owner"],
        targets: ["owner"],
        labels: [
          {
            id: "label",
            width: 180,
            height: 140,
            layoutOptions: { "elk.edgeLabels.inline": true },
          },
        ],
      },
    ],
  });
  const previous = result.children!.find((node) => node.id === "previous")!;
  const label = result.edges!.find((edge) => edge.id === "loop")!.labels![0]!;
  expect(label.y!).toBeGreaterThanOrEqual(previous.y! + previous.height!);
});
