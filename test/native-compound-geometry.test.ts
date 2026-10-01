import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import { getLayoutRoutes, orthogonalRouting } from "../src/routing";

const input = () =>
  createGraph({
    nodes: [
      { id: "root", width: 220, height: 60 },
      { id: "a", parentId: "root", width: 120, height: 50 },
      { id: "b", parentId: "root", width: 120, height: 50 },
      { id: "outside", width: 120, height: 50 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", width: 340, height: 70 },
      { id: "enter", sourceId: "root", targetId: "b", width: 180, height: 50 },
      { id: "exit", sourceId: "b", targetId: "outside", width: 180, height: 50 },
    ],
  });
for (const direction of ["up", "down", "left", "right"] as const) {
  it(`reserves complete compound geometry before ancestor packing (${direction})`, () => {
    const graph = input();
    const result = getLayeredLayout(graph, {
      direction,
      padding: { top: 11, right: 23, bottom: 17, left: 29 },
      compound: () => ({ header: { width: 220, height: 60, side: "top" } }),
      edgeAttachment: (edge) =>
        edge.id === "enter" ? { source: "content", label: "target-boundary" } : undefined,
    });
    const root = result.nodes.find((n) => n.id === "root")!;
    const content = result.compoundGeometry.get("root")!.content;
    expect(content.y).toBeGreaterThanOrEqual(71);
    for (const id of ["a", "b"]) {
      const n = result.nodes.find((n) => n.id === id)!;
      expect(n.x).toBeGreaterThanOrEqual(content.x);
      expect(n.y).toBeGreaterThanOrEqual(content.y);
      expect(n.x + n.width).toBeLessThanOrEqual(content.x + content.width);
      expect(n.y + n.height).toBeLessThanOrEqual(content.y + content.height);
    }
    for (const id of ["ab", "enter"]) {
      const label = result.edges.find((e) => e.id === id)!;
      expect(label.x).toBeGreaterThanOrEqual(root.x + content.x);
      expect(label.y).toBeGreaterThanOrEqual(root.y + content.y);
      expect(label.x + label.width).toBeLessThanOrEqual(root.x + content.x + content.width);
      expect(label.y + label.height).toBeLessThanOrEqual(root.y + content.y + content.height);
      for (const n of result.nodes.filter((n) => n.parentId === "root")) {
        expect(
          label.x < root.x + n.x + n.width &&
            label.x + label.width > root.x + n.x &&
            label.y < root.y + n.y + n.height &&
            label.y + label.height > root.y + n.y,
        ).toBe(false);
      }
    }
    expect(graph).toEqual(input());
  });
}

it("retains finalized compound sizes when a measure callback measures headers", () => {
  const graph = createGraph({
    nodes: [
      { id: "outer" },
      { id: "inner", parentId: "outer" },
      { id: "child", parentId: "inner", width: 500, height: 300 },
    ],
    edges: [],
  });
  const result = getLayeredLayout(graph, {
    measure: (node) =>
      node.id === "child" ? { width: 500, height: 300 } : { width: 120, height: 40 },
    compound: () => ({ header: { width: 120, height: 40 } }),
  });
  expect(result.nodes.find((n) => n.id === "inner")!.width).toBeGreaterThan(500);
  expect(result.nodes.find((n) => n.id === "outer")!.width).toBeGreaterThan(
    result.nodes.find((n) => n.id === "inner")!.width,
  );
});

it("uses inward content attachments for parent-child edges and outer hooks for reentry", () => {
  const graph = createGraph({
    nodes: [
      { id: "group", width: 200, height: 60 },
      { id: "child", parentId: "group", width: 160, height: 60 },
    ],
    edges: [
      { id: "normal", sourceId: "group", targetId: "child", width: 120, height: 40 },
      { id: "reenter", sourceId: "group", targetId: "child", width: 120, height: 40 },
    ],
  });
  const result = getLayeredLayout(graph, {
    direction: "down",
    padding: 40,
    compound: () => ({ header: { width: 200, height: 60 } }),
    edgeAttachment: (edge) => ({
      source: edge.id === "reenter" ? "outer" : "content",
      label: "target-boundary",
    }),
  });
  const geometry = result.compoundGeometry.get("group")!;
  const group = result.nodes.find((n) => n.id === "group")!;
  const normal = result.edges.find((e) => e.id === "normal")!;
  const reenter = result.edges.find((e) => e.id === "reenter")!;
  const a = normal.points![0]!;
  expect(a.x).toBeGreaterThan(group.x);
  expect(a.x).toBeLessThan(group.x + group.width);
  expect(a.y).toBeGreaterThanOrEqual(group.y + geometry.content.y);
  const b = reenter.points![0]!,
    lead = reenter.points![1]!;
  const onOuter =
    b.x === group.x ||
    b.x === group.x + group.width ||
    b.y === group.y ||
    b.y === group.y + group.height;
  expect(onOuter).toBe(true);
  expect(
    lead.x <= group.x ||
      lead.x >= group.x + group.width ||
      lead.y <= group.y ||
      lead.y >= group.y + group.height,
  ).toBe(true);
  // Label sections are disconnected by the label's occupied rectangle. The
  // flattened GraphEdge.points bridge may traverse the label diagonally.
  expect(normal.points!.length).toBeGreaterThan(2);
  expect(reenter.points!.length).toBeGreaterThan(2);
});

it("preserves label gaps and original per-edge settings through scoped placement", () => {
  const graph = input();
  const seen = new Set<string>();
  const result = getLayeredLayout(graph, {
    edgeSettings: (edge) => {
      expect(graph.edges.map((e) => e.id)).toContain(edge.id);
      seen.add(edge.id);
      return { "priority.direction": 3 };
    },
    compound: () => ({ header: { width: 220, height: 60 } }),
  });
  expect(seen.has("ab")).toBe(true);
  expect(getLayoutRoutes(result)).toBe(result.compoundRoutes);
  expect(result.compoundRoutes.get("enter")!.sections).toHaveLength(2);
  for (const route of result.compoundRoutes.values())
    for (const section of route.sections) {
      let previous = section.path.start;
      for (const segment of section.path.segments) {
        expect(segment.kind).toBe("line");
        expect(previous.x === segment.to.x || previous.y === segment.to.y).toBe(true);
        previous = segment.to;
      }
    }
});

it("keeps named ports outer-local when the attachment rectangle is inset", () => {
  const graph = createGraph({
    nodes: [
      {
        id: "parent",
        x: 100,
        y: 200,
        width: 300,
        height: 300,
        ports: [{ name: "out", x: 300, y: 150 }],
      },
      { id: "child", parentId: "parent", x: 150, y: 140, width: 60, height: 40 },
    ],
    edges: [{ id: "enter", sourceId: "parent", sourcePort: "out", targetId: "child" }],
  });
  const result = orthogonalRouting.route(graph, {
    coordinateSpace: "world",
    edges: {
      enter: {
        sourceAttachment: {
          bounds: { x: 40, y: 80, width: 220, height: 180 },
          facing: "inward",
        },
      },
    },
  });
  expect(result.routes.get("enter")!.sections[0]!.path.start).toEqual({ x: 400, y: 350 });
});

it("preserves a forward labeled chain under model-order cycle breaking", () => {
  const result = getLayeredLayout(
    createGraph({
      nodes: [
        { id: "parent", width: 200, height: 60 },
        ...["a", "b", "c"].map((id) => ({ id, parentId: "parent", width: 100, height: 50 })),
      ],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b", width: 160, height: 40 },
        { id: "bc", sourceId: "b", targetId: "c", width: 160, height: 40 },
      ],
    }),
    {
      direction: "down",
      settings: { "cycleBreaking.strategy": "MODEL_ORDER" },
      compound: () => ({ header: { width: 200, height: 60 } }),
    },
  );
  const [a, b, c] = ["a", "b", "c"].map((id) => result.nodes.find((n) => n.id === id)!);
  expect(b!.y).toBeGreaterThan(a!.y + a!.height);
  expect(c!.y).toBeGreaterThan(b!.y + b!.height);
});
