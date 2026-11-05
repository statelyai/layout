import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import type { PeleLayoutOptions } from "../src";
import { getLayout, getLayoutRoutes, getPeleLayout, routeToPolylines } from "../src";
import { worldGeometry } from "../src/authoring/coordinates";

function fixture() {
  return createGraph({
    nodes: [
      { id: "on", width: 76.02, height: 45 },
      { id: "idle", parentId: "on", width: 61.98, height: 45 },
      { id: "working", parentId: "on", width: 104.89, height: 45 },
      { id: "newState1", width: 124.89, height: 45 },
      { id: "newState2", width: 129.56, height: 45 },
    ],
    edges: [
      { id: "start", sourceId: "idle", targetId: "working", width: 58.59, height: 28 },
      { id: "done", sourceId: "working", targetId: "idle", width: 54.19, height: 28 },
      { id: "out", sourceId: "on", targetId: "newState1", width: 106.06, height: 28 },
      { id: "in", sourceId: "newState2", targetId: "on", width: 102.77, height: 28 },
      { id: "next", sourceId: "newState2", targetId: "newState1", width: 106.47, height: 28 },
    ],
  });
}

describe("Pele compound layout", () => {
  it("applies broad compound callbacks only to nodes with children", () => {
    const input = fixture();
    const options: PeleLayoutOptions = {
      compound: () => ({
        padding: 80,
        header: { width: 300, height: 150 },
        minContentSize: { width: 500, height: 400 },
      }),
    };
    const result = getPeleLayout(input, options);
    expect([...result.compoundGeometry.keys()]).toEqual(["on"]);
    for (const node of input.nodes.filter((node) => node.id !== "on")) {
      const placed = result.nodes.find((candidate) => candidate.id === node.id)!;
      expect(placed.width).toBe(node.width);
      expect(placed.height).toBe(node.height);
    }
    const flat = createGraph({ nodes: [{ id: "leaf", width: 100, height: 60 }] });
    expect(getPeleLayout(flat, options)).toEqual(getPeleLayout(flat));
  });
  it.each(["down", "up", "left", "right"] as const)(
    "lays out the reported nested graph going %s",
    (direction) => {
      const input = fixture(),
        before = structuredClone(input);
      const options: PeleLayoutOptions = {
        direction,
        compound: (node) =>
          node.id === "on"
            ? {
                direction: "down" as const,
                header: { width: 76.02, height: 45 },
                padding: 32,
              }
            : undefined,
      };
      const result = getPeleLayout(input, options);
      expect(input).toEqual(before);
      expect(result).toEqual(getPeleLayout(input, options));
      expect(result.edgeCoordinateSpace).toBe("world");
      const group = result.nodes[0]!;
      const content = result.compoundGeometry.get("on")!.content;
      for (const child of result.nodes.filter((node) => node.parentId === "on")) {
        expect(child.x).toBeGreaterThanOrEqual(content.x - 0.01);
        expect(child.y).toBeGreaterThanOrEqual(content.y - 0.01);
        expect(child.x + child.width).toBeLessThanOrEqual(content.x + content.width + 0.01);
        expect(child.y + child.height).toBeLessThanOrEqual(content.y + content.height + 0.01);
      }
      expect(group.width).toBeGreaterThan(104.89);
      expect(result.nodes[1]!.y).toBeLessThan(result.nodes[2]!.y);
      const routes = getLayoutRoutes(result);
      expect(routes.size).toBe(5);
      for (const route of routes.values()) {
        expect(route.status).toBe("routed");
        expect(route.sections).toHaveLength(2);
        expect(
          routeToPolylines(route)
            .flat()
            .every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
        ).toBe(true);
        const label = route.label!.bounds;
        const entry = route.sections[0]!.path.segments.at(-1)!.to;
        const exit = route.sections[1]!.path.start;
        for (const point of [entry, exit])
          expect(
            Math.min(
              Math.hypot(point.x - label.x - label.width / 2, point.y - label.y),
              Math.hypot(point.x - label.x - label.width / 2, point.y - label.y - label.height),
              Math.hypot(point.x - label.x, point.y - label.y - label.height / 2),
              Math.hypot(point.x - label.x - label.width, point.y - label.y - label.height / 2),
            ),
          ).toBeLessThan(0.02);
      }
    },
  );

  it("stitches edges across differently directed nested groups", () => {
    const input = fixture();
    const result = getPeleLayout(
      createGraph({
        ...input,
        edges: [
          ...input.edges,
          { id: "cross", sourceId: "idle", targetId: "newState1", width: 80, height: 30 },
        ],
      }),
      {
        direction: "right",
        compound: (node) => (node.id === "on" ? { direction: "down", padding: 24 } : undefined),
      },
    );
    const world = worldGeometry(result);
    const source = world.nodes.find((node) => node.id === "idle")!;
    const target = world.nodes.find((node) => node.id === "newState1")!;
    const route = getLayoutRoutes(result).get("cross")!;
    const start = route.sections[0]!.path.start,
      end = route.sections.at(-1)!.path.segments.at(-1)!.to;
    expect(
      Math.min(
        Math.abs(start.x - source.x),
        Math.abs(start.x - source.x - source.width),
        Math.abs(start.y - source.y),
        Math.abs(start.y - source.y - source.height),
      ),
    ).toBeLessThan(0.01);
    expect(end.x).toBeCloseTo(target.x);
  });

  it.each(["top", "right", "bottom", "left"] as const)(
    "reserves %s headers and asymmetric minimum content areas",
    (side) => {
      const result = getPeleLayout(fixture(), {
        compound: (node) =>
          node.id === "on"
            ? {
                header: { width: 100, height: 45, side },
                padding: { top: 11, right: 23, bottom: 37, left: 49 },
                minContentSize: { width: 400, height: 350 },
              }
            : undefined,
      });
      const geometry = result.compoundGeometry.get("on")!;
      expect(geometry.content.width).toBeGreaterThanOrEqual(400);
      expect(geometry.content.height).toBeGreaterThanOrEqual(350);
      const h = geometry.header!,
        c = geometry.content;
      expect(
        h.x + h.width <= c.x ||
          c.x + c.width <= h.x ||
          h.y + h.height <= c.y ||
          c.y + c.height <= h.y,
      ).toBe(true);
    },
  );

  it("reserves loop labels and routes ancestor connections to content borders", () => {
    const input = fixture();
    const result = getPeleLayout(
      createGraph({
        ...input,
        edges: [
          ...input.edges,
          { id: "loop", sourceId: "on", targetId: "on", width: 80, height: 28 },
          { id: "loop2", sourceId: "on", targetId: "on", width: 80, height: 28 },
          { id: "inside", sourceId: "on", targetId: "idle", width: 80, height: 28 },
        ],
      }),
      {
        compound: (node) =>
          node.id === "on" ? { header: { width: 76, height: 45 }, padding: 32 } : undefined,
      },
    );
    const routes = getLayoutRoutes(result);
    for (const id of ["loop", "loop2", "inside"]) {
      const route = routes.get(id)!;
      expect(route.status).toBe("routed");
      expect(route.sections).toHaveLength(2);
    }
    expect(routes.get("loop")!.label!.bounds).not.toEqual(routes.get("loop2")!.label!.bounds);
    const parent = result.nodes[0]!,
      content = result.compoundGeometry.get("on")!.content;
    const attachment = routes.get("inside")!.sections[0]!.path.start;
    expect(attachment.x).toBeGreaterThanOrEqual(parent.x + content.x - 0.01);
    expect(attachment.x).toBeLessThanOrEqual(parent.x + content.x + content.width + 0.01);
    expect(attachment.y).toBeGreaterThanOrEqual(parent.y + content.y - 0.01);
    expect(attachment.y).toBeLessThanOrEqual(parent.y + content.y + content.height + 0.01);
  });

  it("advertises hierarchy without granting incremental routing or constraint support", async () => {
    await expect(getLayout({ graph: fixture(), algorithm: "pele" })).resolves.toMatchObject({
      graph: { edgeCoordinateSpace: "world" },
    });
    await expect(
      getLayout({
        graph: fixture(),
        algorithm: "pele",
        scope: { mode: "route-only", previous: getPeleLayout(fixture()) },
      }),
    ).rejects.toThrow(/route.only/);
  });

  it("rejects missing parents and cyclic hierarchy", () => {
    expect(() => getPeleLayout(createGraph({ nodes: [{ id: "a", parentId: "missing" }] }))).toThrow(
      /parent/,
    );
    expect(() =>
      getPeleLayout(
        createGraph({
          nodes: [
            { id: "a", parentId: "b" },
            { id: "b", parentId: "a" },
          ],
        }),
      ),
    ).toThrow(/[Cc]ycl/);
  });

  it("keeps cross-group edges outside header interiors", () => {
    const input = fixture();
    const result = getPeleLayout(
      createGraph({
        ...input,
        edges: [
          ...input.edges,
          { id: "enter-child", sourceId: "newState2", targetId: "idle", width: 80, height: 28 },
        ],
      }),
      {
        direction: "down",
        compound: (node) =>
          node.id === "on" ? { header: { width: 76, height: 45 }, padding: 24 } : undefined,
      },
    );
    const node = result.nodes[0]!,
      header = result.compoundGeometry.get("on")!.header!;
    const route = getLayoutRoutes(result).get("enter-child")!;
    expect(route.status).toBe("routed");
    for (const point of routeToPolylines(route, { tolerance: 0.1 }).flat())
      expect(
        point.x > node.x + header.x + 0.1 &&
          point.x < node.x + header.x + header.width - 0.1 &&
          point.y > node.y + header.y + 0.1 &&
          point.y < node.y + header.y + header.height - 0.1,
      ).toBe(false);
  });

  it("honors explicit outer attachments on ancestor edges", () => {
    const input = fixture();
    const result = getPeleLayout(
      createGraph({
        ...input,
        edges: [
          ...input.edges,
          { id: "reenter", sourceId: "on", targetId: "idle", width: 80, height: 28 },
        ],
      }),
      {
        compound: (node) =>
          node.id === "on" ? { header: { width: 76, height: 45 }, padding: 32 } : undefined,
        edgeAttachment: (edge) => (edge.id === "reenter" ? { source: "outer" } : undefined),
      },
    );
    const route = getLayoutRoutes(result).get("reenter")!;
    expect(route.status).toBe("routed");
    const p = route.sections[0]!.path.start,
      parent = result.nodes[0]!;
    expect(
      Math.min(
        Math.abs(p.x - parent.x),
        Math.abs(p.x - parent.x - parent.width),
        Math.abs(p.y - parent.y),
        Math.abs(p.y - parent.y - parent.height),
      ),
    ).toBeLessThan(0.01);
  });

  it("keeps unlabeled loops continuous and invalidates stale cached curves", () => {
    const input = fixture();
    const result = getPeleLayout(
      createGraph({
        ...input,
        edges: [
          ...input.edges,
          { id: "loop", sourceId: "idle", targetId: "idle", width: 0, height: 0 },
        ],
      }),
    );
    expect(getLayoutRoutes(result).get("loop")!.sections).toHaveLength(1);
    const before = getLayoutRoutes(result);
    result.nodes[1]!.x += 10;
    expect(getLayoutRoutes(result)).not.toBe(before);
  });

  it("keeps multiple nested coordinate frames and measured labels intact", () => {
    const result = getPeleLayout(
      createGraph({
        nodes: [
          { id: "outer", width: 100, height: 45 },
          { id: "inner", parentId: "outer", width: 90, height: 45 },
          { id: "a", parentId: "inner", width: 120, height: 60 },
          { id: "b", parentId: "inner", width: 120, height: 60 },
          { id: "outside", width: 120, height: 60 },
        ],
        edges: [
          { id: "guard", sourceId: "a", targetId: "b", width: 320, height: 120 },
          { id: "cross", sourceId: "b", targetId: "outside", width: 100, height: 28 },
        ],
      }),
      {
        direction: "right",
        compound: (node) =>
          node.id === "outer" || node.id === "inner"
            ? {
                direction: node.id === "outer" ? "left" : "down",
                header: { width: 100, height: 45 },
                padding: 32,
              }
            : undefined,
      },
    );
    const world = worldGeometry(result);
    for (const node of world.nodes) {
      const parent = world.nodes.find((candidate) => candidate.id === node.parentId);
      if (!parent) continue;
      expect(node.x).toBeGreaterThanOrEqual(parent.x);
      expect(node.y).toBeGreaterThanOrEqual(parent.y);
      expect(node.x + node.width).toBeLessThanOrEqual(parent.x + parent.width + 0.01);
      expect(node.y + node.height).toBeLessThanOrEqual(parent.y + parent.height + 0.01);
    }
    expect(getLayoutRoutes(result).get("guard")!.label!.bounds).toMatchObject({
      width: 320,
      height: 120,
    });
    expect(getLayoutRoutes(result).get("cross")!.status).toBe("routed");
  });
});
