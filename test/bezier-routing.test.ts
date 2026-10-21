import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import {
  bezierRouting,
  toSvgPath,
  segmentCrossesRect,
  type Route,
  type RoutingSettings,
  type EdgeRoutingSettings,
} from "../src/routing";

function chain() {
  return createGraph({
    id: "chain",
    nodes: [
      {
        id: "a",
        x: 0,
        y: 80,
        width: 60,
        height: 60,
        ports: [{ name: "invoke", x: 50, y: 25, width: 10, height: 10 }],
      },
      { id: "b", x: 400, y: 80, width: 60, height: 60 },
      { id: "c", x: 450, y: 300, width: 60, height: 60 },
      { id: "d", x: 450, y: 500, width: 60, height: 60 },
      { id: "unrelated-a", x: 0, y: 1500, width: 60, height: 60 },
      { id: "unrelated-b", x: 400, y: 1700, width: 60, height: 60 },
    ],
    edges: [
      { id: "z-root", sourceId: "a", targetId: "b", x: 180, y: 95, width: 80, height: 30 },
      { id: "y-child", sourceId: "a", targetId: "c", x: 200, y: 280, width: 80, height: 30 },
      { id: "x-grandchild", sourceId: "a", targetId: "d", x: 210, y: 480, width: 80, height: 30 },
      {
        id: "ordinary",
        sourceId: "unrelated-a",
        targetId: "unrelated-b",
        x: 180,
        y: 1580,
        width: 80,
        height: 30,
      },
    ],
  });
}
const settings: RoutingSettings = {
  coordinateSpace: "world",
  bezier: { avoidObstacles: true, targetClearance: 10 },
  edges: {
    "y-child": { sourceLabel: "z-root" },
    "x-grandchild": { sourceLabel: "y-child" },
  },
};
function route(result: ReturnType<typeof bezierRouting.route>, id: string): Route {
  const value = result.routes.get(id)!;
  expect(value.sections).toHaveLength(2);
  value.sections.forEach((section) => expect(toSvgPath(section.path)).not.toMatch(/NaN|Infinity/));
  return value;
}
function within(
  point: { x: number; y: number },
  rect: { x?: number; y?: number; width?: number; height?: number },
) {
  expect(point.x).toBeGreaterThanOrEqual(rect.x! - 1e-6);
  expect(point.x).toBeLessThanOrEqual(rect.x! + rect.width! + 1e-6);
  expect(point.y).toBeGreaterThanOrEqual(rect.y! - 1e-6);
  expect(point.y).toBeLessThanOrEqual(rect.y! + rect.height! + 1e-6);
}

describe("shared Bézier label chains", () => {
  it("routes two and three connected labels independently of graph order", () => {
    const graph = chain();
    for (const edges of [
      graph.edges,
      [...graph.edges].reverse(),
      graph.edges.filter((edge) => edge.id !== "x-grandchild"),
    ]) {
      const result = bezierRouting.route({ ...graph, edges }, settings);
      for (const id of [
        "z-root",
        "y-child",
        ...(edges.some((edge) => edge.id === "x-grandchild") ? ["x-grandchild"] : []),
      ])
        route(result, id);
      expect(result.routes.get("y-child")!.sections[0]!.from).toEqual({
        kind: "label",
        edgeId: "z-root",
      });
      within(result.routes.get("y-child")!.sections[0]!.path.start, graph.edges[0]!);
    }
    expect([...bezierRouting.route(graph, settings).routes]).toEqual([
      ...bezierRouting.route({ ...graph, edges: [...graph.edges].reverse() }, settings).routes,
    ]);
  });
  it("moves a child's attachment with its parent and converges with fresh routing", () => {
    const graph = chain(),
      previous = bezierRouting.route(graph, settings),
      before = [...previous.routes];
    const next = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.id === "z-root" ? { ...edge, y: 180, x: 250 } : edge)),
    };
    const update = bezierRouting.update(next, previous, getDiff(graph, next));
    const child = route(update.snapshot, "y-child");
    within(child.sections[0]!.path.start, next.edges[0]!);
    expect(child.sections[0]!.path.start).not.toEqual(
      previous.routes.get("y-child")!.sections[0]!.path.start,
    );
    expect([...update.snapshot.routes]).toEqual([...bezierRouting.route(next, settings).routes]);
    expect(update.snapshot.routes.get("ordinary")).toBe(previous.routes.get("ordinary"));
    expect([...previous.routes]).toEqual(before);
  });
  it("preserves a root's fixed port and ignores inherited child port metadata", () => {
    const graph = chain();
    const port = {
      kind: "port" as const,
      point: { x: 60, y: 110 },
      direction: "right" as const,
      escape: { x: 70, y: 110 },
      owner: { x: 0, y: 80, width: 60, height: 60 },
    };
    const result = bezierRouting.route(
      { ...graph, edges: graph.edges.map((edge) => ({ ...edge, sourcePort: "invoke" })) },
      {
        ...settings,
        edges: {
          ...settings.edges,
          "z-root": { bezier: { source: port } },
          "y-child": { sourceLabel: "z-root", bezier: { source: port } },
        },
      },
    );
    expect(route(result, "z-root").sections[0]!.path.start).toEqual(port.point);
    const child = route(result, "y-child");
    expect(child.sections[0]!.from).toEqual({ kind: "label", edgeId: "z-root" });
    within(child.sections[0]!.path.start, graph.edges[0]!);
  });
  it("routes a one-sided label with separate entry and exit attachments", () => {
    const result = bezierRouting.route(chain(), {
      ...settings,
      edges: { ...settings.edges, "y-child": { sourceLabel: "z-root", labelSides: ["right"] } },
    });
    const child = route(result, "y-child");
    const incoming = child.sections[0]!.path.segments.at(-1)!.to;
    const outgoing = child.sections[1]!.path.start;
    expect(incoming.x).toBeCloseTo(280);
    expect(outgoing.x).toBeCloseTo(280);
    expect(incoming.y).not.toBeCloseTo(outgoing.y);
  });
  it("sets generated targets back for arrow clearance", () => {
    const result = bezierRouting.route(chain(), settings);
    const end = route(result, "y-child").sections[1]!.path.segments.at(-1)!.to;
    const bounds = chain().nodes.find((node) => node.id === "c")!;
    const distance = Math.hypot(
      Math.max(bounds.x! - end.x, 0, end.x - bounds.x! - bounds.width!),
      Math.max(bounds.y! - end.y, 0, end.y - bounds.y! - bounds.height!),
    );
    expect(distance).toBeCloseTo(10);
  });
  it("reroutes changed source references without mutating the prior topology", () => {
    const graph = chain(),
      previous = bezierRouting.route(graph, settings);
    const nextSettings: RoutingSettings = {
      ...settings,
      edges: { ...settings.edges, "x-grandchild": { sourceLabel: "z-root" } },
    };
    const update = bezierRouting.update(graph, previous, getDiff(graph, graph), nextSettings);
    expect(route(update.snapshot, "x-grandchild").sections[0]!.from).toEqual({
      kind: "label",
      edgeId: "z-root",
    });
    expect(route(previous, "x-grandchild").sections[0]!.from).toEqual({
      kind: "label",
      edgeId: "y-child",
    });
    expect([...update.snapshot.routes]).toEqual([
      ...bezierRouting.route(graph, nextSettings).routes,
    ]);
    expect(update.snapshot.routes.get("ordinary")).toBe(previous.routes.get("ordinary"));
  });
  it("honors custom floating connection frames and departure sides", () => {
    const graph = chain();
    const source = { x: 10, y: 90, width: 40, height: 40 };
    const target = { x: 410, y: 90, width: 40, height: 40 };
    const result = bezierRouting.route(
      { ...graph, edges: [graph.edges[0]!] },
      {
        coordinateSpace: "world",
        bezier: {},
        edges: {
          "z-root": {
            bezier: {
              source: { kind: "floating", bounds: source, sides: ["right"] },
              target: { kind: "floating", bounds: target, sides: ["left"] },
            },
          },
        },
      },
    );
    const value = route(result, "z-root");
    expect(value.sections[0]!.path.start.x).toBeCloseTo(50);
    within(value.sections[0]!.path.start, source);
    expect(value.sections[1]!.path.segments.at(-1)!.to.x).toBeCloseTo(400);
  });
  it("keeps authored waypoints on the visible source section", () => {
    const waypoint = { x: 300, y: 250 };
    const graph = createGraph({
      id: "waypoint",
      nodes: [
        { id: "a", x: 0, y: 0, width: 60, height: 60 },
        { id: "b", x: 400, y: 0, width: 60, height: 60 },
      ],
      edges: [{ id: "edge", sourceId: "a", targetId: "b", x: 180, y: 15, width: 80, height: 30 }],
    });
    const result = bezierRouting.route(graph, {
      bezier: {},
      edges: { edge: { waypoints: [waypoint] } },
    });
    const value = route(result, "edge");
    expect(value.sections[0]!.path.segments.map((segment) => segment.to)).toContainEqual(waypoint);
  });
  it("resolves a named positioned port before generating a family guide", () => {
    const graph = chain();
    const result = bezierRouting.route(
      {
        ...graph,
        edges: graph.edges.map((edge) =>
          edge.id === "z-root" ? { ...edge, sourcePort: "invoke" } : edge,
        ),
      },
      settings,
    );
    const root = route(result, "z-root");
    expect(root.sections[0]!.path.start).toEqual({ x: 55, y: 110 });
    expect(root.sections[0]!.from).toEqual({ kind: "node", nodeId: "a", port: "invoke" });
    route(result, "y-child");
  });
  it("keeps a named target port fixed with its declared arrival side", () => {
    const graph = createGraph({
      id: "target-port",
      nodes: [
        { id: "a", x: 0, y: 0, width: 60, height: 60 },
        { id: "b", x: 400, y: 0, width: 60, height: 60, ports: [{ name: "top", x: 10, y: 0 }] },
      ],
      edges: [
        {
          id: "edge",
          sourceId: "a",
          targetId: "b",
          targetPort: "top",
          x: 180,
          y: 15,
          width: 80,
          height: 30,
        },
      ],
    });
    const value = route(bezierRouting.route(graph, { bezier: {} }), "edge");
    expect(value.sections[1]!.path.segments.at(-1)!.to).toEqual({ x: 410, y: 0 });
    expect(value.sections[1]!.toSide).toBe("top");
  });
  it("plans and validates explicit family obstacles before accepting a fallback", () => {
    const obstacle = { x: 100, y: 20, width: 20, height: 20 };
    const graph = createGraph({
      id: "barrier",
      nodes: [
        { id: "a", x: 0, y: 0, width: 60, height: 60 },
        { id: "b", x: 400, y: 0, width: 60, height: 60 },
        { id: "c", x: 400, y: 250, width: 60, height: 60 },
      ],
      edges: [
        { id: "e", sourceId: "a", targetId: "b", x: 180, y: 15, width: 80, height: 30 },
        { id: "f", sourceId: "a", targetId: "c", x: 180, y: 200, width: 80, height: 30 },
      ],
    });
    const result = bezierRouting.route(graph, {
      bezier: {},
      edges: { e: { bezier: { obstacles: [obstacle] } }, f: { sourceLabel: "e" } },
    });
    const root = route(result, "e");
    for (const section of root.sections) {
      let start = section.path.start;
      for (const segment of section.path.segments) {
        expect(segmentCrossesRect(start, segment, obstacle)).toBe(false);
        start = segment.to;
      }
    }
    route(result, "f");
  });
  it("rejects all dependents of a newly introduced ancestor cycle", () => {
    const graph = chain(),
      previous = bezierRouting.route(graph, settings);
    const nextSettings: RoutingSettings = {
      ...settings,
      edges: { ...settings.edges, "z-root": { sourceLabel: "y-child" } },
    };
    const update = bezierRouting.update(graph, previous, getDiff(graph, graph), nextSettings);
    const fresh = bezierRouting.route(graph, nextSettings);
    for (const id of ["z-root", "y-child", "x-grandchild"]) {
      expect(update.snapshot.routes.get(id)!.sections).toEqual([]);
      expect(fresh.routes.get(id)!.sections).toEqual([]);
    }
    expect([...update.snapshot.routes]).toEqual([...fresh.routes]);
    expect(route(previous, "x-grandchild").sections).toHaveLength(2);
  });
  it("protects endpoint owners in simple mode even when a supplied guide crosses them", () => {
    const graph = createGraph({
      id: "simple",
      nodes: [
        { id: "a", x: 0, y: 0, width: 60, height: 60 },
        { id: "b", x: 400, y: 0, width: 60, height: 60 },
      ],
      edges: [{ id: "edge", sourceId: "a", targetId: "b", x: 180, y: 15, width: 80, height: 30 }],
    });
    const value = route(
      bezierRouting.route(graph, {
        bezier: { avoidObstacles: false },
        edges: {
          edge: {
            bezier: {
              attachmentMode: "orthogonal",
              guides: {
                source: {
                  points: [
                    { x: 60, y: 30 },
                    { x: 10, y: 30 },
                    { x: 180, y: 30 },
                  ],
                  sourceDirection: "left",
                  targetDirection: "left",
                },
                target: {
                  points: [
                    { x: 260, y: 30 },
                    { x: 390, y: 30 },
                  ],
                  sourceDirection: "right",
                  targetDirection: "left",
                },
              },
            },
          },
        },
      }),
      "edge",
    );
    for (const section of value.sections) {
      let start = section.path.start;
      for (const segment of section.path.segments) {
        for (const node of graph.nodes)
          expect(
            segmentCrossesRect(start, segment, {
              x: node.x!,
              y: node.y!,
              width: node.width!,
              height: node.height!,
            }),
          ).toBe(false);
        start = segment.to;
      }
    }
  });
  it.each([
    {
      constraint: { labelSides: ["top"] },
      sourceSide: "right",
      labelSide: "top",
      targetSide: "left",
    },
    {
      constraint: { sourceSides: ["bottom"] },
      sourceSide: "bottom",
      labelSide: undefined,
      targetSide: "left",
    },
    {
      constraint: { targetSides: ["top"] },
      sourceSide: "right",
      labelSide: undefined,
      targetSide: "top",
    },
  ] satisfies {
    constraint: EdgeRoutingSettings;
    sourceSide: string;
    labelSide: string | undefined;
    targetSide: string;
  }[])(
    "replans supplied guides that conflict with $constraint",
    ({ constraint, sourceSide, labelSide, targetSide }) => {
      const graph = createGraph({
        id: "supplied-constraints",
        nodes: [
          { id: "a", x: 0, y: 0, width: 60, height: 60 },
          { id: "b", x: 400, y: 0, width: 60, height: 60 },
        ],
        edges: [{ id: "e", sourceId: "a", targetId: "b", x: 180, y: 15, width: 80, height: 30 }],
      });
      const value = route(
        bezierRouting.route(graph, {
          bezier: { avoidObstacles: false },
          edges: {
            e: {
              ...constraint,
              bezier: {
                attachmentMode: "orthogonal",
                guides: {
                  source: {
                    points: [
                      { x: 60, y: 30 },
                      { x: 180, y: 30 },
                    ],
                    sourceDirection: "right",
                    targetDirection: "left",
                  },
                  target: {
                    points: [
                      { x: 260, y: 30 },
                      { x: 390, y: 30 },
                    ],
                    sourceDirection: "right",
                    targetDirection: "left",
                  },
                },
              },
            },
          },
        }),
        "e",
      );
      expect(value.sections[0]!.fromSide).toBe(sourceSide);
      expect(value.sections[1]!.toSide).toBe(targetSide);
      if (labelSide) {
        expect(value.sections[0]!.toSide).toBe(labelSide);
        expect(value.sections[1]!.fromSide).toBe(labelSide);
      }
    },
  );
  it("replans child guides that reuse a parent's reserved attachment side", () => {
    const result = bezierRouting.route(chain(), {
      ...settings,
      edges: {
        ...settings.edges,
        "y-child": {
          sourceLabel: "z-root",
          bezier: {
            attachmentMode: "orthogonal",
            guides: {
              source: {
                points: [
                  { x: 260, y: 110 },
                  { x: 280, y: 110 },
                  { x: 280, y: 295 },
                ],
                sourceDirection: "right",
                targetDirection: "right",
              },
              target: {
                points: [
                  { x: 280, y: 300 },
                  { x: 440, y: 330 },
                ],
                sourceDirection: "right",
                targetDirection: "left",
              },
            },
          },
        },
      },
    });
    const parent = route(result, "z-root");
    const child = route(result, "y-child");
    expect(child.sections[0]!.fromSide).not.toBe(parent.sections[0]!.toSide);
    expect(child.sections[0]!.fromSide).not.toBe(parent.sections[1]!.fromSide);
    within(child.sections[0]!.path.start, chain().edges[0]!);
  });
  it("routes a child around its parent when departing from the free top side", () => {
    const graph = createGraph({
      id: "parent-barrier",
      nodes: [
        { id: "a", x: 0, y: 100, width: 60, height: 60 },
        { id: "b", x: 500, y: 100, width: 60, height: 60 },
        { id: "c", x: 500, y: 300, width: 60, height: 60 },
      ],
      edges: [
        { id: "root", sourceId: "a", targetId: "b", x: 200, y: 115, width: 80, height: 30 },
        { id: "child", sourceId: "a", targetId: "c", x: 200, y: 250, width: 80, height: 30 },
      ],
    });
    for (const avoidObstacles of [false, true]) {
      const value = route(
        bezierRouting.route(graph, {
          bezier: { avoidObstacles },
          edges: { child: { sourceLabel: "root", sourceSides: ["top"] } },
        }),
        "child",
      );
      expect(value.sections[0]!.fromSide).toBe("top");
      const parent = { x: 200, y: 115, width: 80, height: 30 };
      for (const section of value.sections) {
        let start = section.path.start;
        for (const segment of section.path.segments) {
          expect(segmentCrossesRect(start, segment, parent)).toBe(false);
          start = segment.to;
        }
      }
    }
  });
  it("reserves distinct free parent sides for sibling labels", () => {
    const graph = chain();
    const result = bezierRouting.route(graph, {
      ...settings,
      edges: {
        "y-child": { sourceLabel: "z-root", sourceSides: ["top", "bottom"] },
        "x-grandchild": { sourceLabel: "z-root", sourceSides: ["top", "bottom"] },
      },
    });
    const first = route(result, "x-grandchild");
    const second = route(result, "y-child");
    expect(first.sections[0]!.fromSide).not.toBe(second.sections[0]!.fromSide);
    expect(["top", "bottom"]).toContain(first.sections[0]!.fromSide);
    expect(["top", "bottom"]).toContain(second.sections[0]!.fromSide);
  });
  it.each(["source", "target"] satisfies ("source" | "target")[])(
    "preserves inward %s connection frames",
    (attachment) => {
      const graph = createGraph({
        id: "inward-frame",
        nodes: [
          { id: "a", x: 0, y: 0, width: 300, height: 200 },
          { id: "b", x: 200, y: 80, width: 60, height: 60, parentId: "a" },
        ],
        edges: [
          {
            id: "e",
            sourceId: attachment === "source" ? "a" : "b",
            targetId: attachment === "source" ? "b" : "a",
            x: 90,
            y: 80,
            width: 50,
            height: 30,
          },
        ],
      });
      const frame = {
        bounds: { x: 20, y: 40, width: 260, height: 140 },
        facing: "inward",
      } satisfies NonNullable<EdgeRoutingSettings["sourceAttachment"]>;
      const result = bezierRouting.route(graph, {
        coordinateSpace: "world",
        bezier: {},
        edges: {
          e:
            attachment === "source"
              ? { sourceSide: "left", sourceAttachment: frame }
              : { targetSide: "left", targetAttachment: frame },
        },
      });
      const value = route(result, "e");
      const section = attachment === "source" ? value.sections[0]! : value.sections[1]!;
      const point = attachment === "source" ? section.path.start : section.path.segments.at(-1)!.to;
      expect(point.x).toBeCloseTo(attachment === "source" ? 20 : 30);
      const child = { x: 200, y: 80, width: 60, height: 60 };
      for (const pathSection of value.sections) {
        let start = pathSection.path.start;
        for (const segment of pathSection.path.segments) {
          expect(segmentCrossesRect(start, segment, child)).toBe(false);
          start = segment.to;
        }
      }
    },
  );
  it("rejects unavailable label sides and propagates rejection to descendants", () => {
    const result = bezierRouting.route(chain(), {
      ...settings,
      edges: { ...settings.edges, "y-child": { sourceLabel: "z-root", sourceSides: [] } },
    });
    expect(route(result, "z-root").sections).toHaveLength(2);
    for (const id of ["y-child", "x-grandchild"]) {
      expect(result.routes.get(id)!.sections).toEqual([]);
      expect(result.routes.get(id)!.diagnostics[0]!.code).toBe("CONSTRAINT_VIOLATION");
    }
    route(result, "ordinary");
  });
  it("rejects missing and cyclic label references", () => {
    for (const parent of ["missing", "y-child"]) {
      const result = bezierRouting.route(chain(), {
        ...settings,
        edges: { ...settings.edges, "z-root": { sourceLabel: parent } },
      });
      expect(result.routes.get("z-root")!.sections).toEqual([]);
      expect(result.routes.get("y-child")!.sections).toEqual([]);
      expect(result.routes.get("x-grandchild")!.sections).toEqual([]);
    }
  });
  it("invalidates descendants when a parent label is removed", () => {
    const graph = chain(),
      previous = bezierRouting.route(graph, settings);
    const next = {
      ...graph,
      edges: graph.edges.map((edge) =>
        edge.id === "z-root" ? { ...edge, width: 0, height: 0 } : edge,
      ),
    };
    const update = bezierRouting.update(next, previous, getDiff(graph, next));
    for (const id of ["z-root", "y-child", "x-grandchild"])
      expect(update.snapshot.routes.get(id)!.sections).toEqual([]);
    expect([...update.snapshot.routes]).toEqual([...bezierRouting.route(next, settings).routes]);
    expect(update.snapshot.routes.get("ordinary")).toBe(previous.routes.get("ordinary"));
  });
  it("keeps unrelated transitions organic beside a conditional family", () => {
    const graph = chain(),
      result = bezierRouting.route(graph, settings);
    const ordinary = route(result, "ordinary");
    expect(ordinary.sections[0]!.path.segments.some((segment) => segment.kind === "cubic")).toBe(
      true,
    );
    expect(ordinary).toEqual(
      bezierRouting
        .route(
          { ...graph, edges: graph.edges.filter((edge) => edge.id === "ordinary") },
          { ...settings, edges: {} },
        )
        .routes.get("ordinary"),
    );
  });
});

it("keeps self-loop arrow clearance on the final approach side", () => {
  const graph = createGraph({
    nodes: [{ id: "a", x: 10, y: 20, width: 100, height: 80 }],
    edges: [{ id: "loop", sourceId: "a", targetId: "a", x: -240, y: 20, width: 100, height: 40 }],
  });
  const result = bezierRouting
    .route(graph, { coordinateSpace: "world", bezier: {} })
    .routes.get("loop")!;
  expect(result.sections).toHaveLength(2);
  const target = result.sections[1]!;
  const end = target.path.segments.at(-1)!.to;
  const before = target.path.segments.at(-2)?.to ?? target.path.start;
  expect(target.toSide).toBe("left");
  expect(end.y).toBeCloseTo(before.y);
  expect(end.x).toBeCloseTo(0);
});

it.each([-1, Infinity, NaN])("rejects invalid target clearance %s", (targetClearance) => {
  expect(() => bezierRouting.route(chain(), { bezier: { targetClearance } })).toThrow(
    /targetClearance/,
  );
});
it("rejects a zero label tangent", () => {
  expect(() =>
    bezierRouting.route(chain(), {
      bezier: {},
      edges: { "z-root": { bezier: { labelTangent: { x: 0, y: 0 } } } },
    }),
  ).toThrow(/labelTangent/);
});

it("validates narrow target frames at the border beyond arrow clearance", () => {
  const graph = createGraph({
    nodes: [
      { id: "a", x: 0, y: -100, width: 60, height: 60 },
      { id: "b", x: 400, y: 0, width: 10, height: 60 },
    ],
    edges: [{ id: "e", sourceId: "a", targetId: "b", x: 380, y: -100, width: 50, height: 30 }],
  });
  const result = bezierRouting
    .route(graph, { coordinateSpace: "world", bezier: {}, edges: { e: { targetSides: ["top"] } } })
    .routes.get("e")!;
  expect(result.sections).toHaveLength(2);
  expect(result.sections[1]!.toSide).toBe("top");
  expect(result.sections[1]!.path.segments.at(-1)!.to).toEqual({ x: 405, y: -10 });
});
