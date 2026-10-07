import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { c, getLayout } from "../src";
import espresso from "./fixtures/espresso-native.json";

// A small statechart: two compound states, each with children.
const statechart = () =>
  createGraph({
    nodes: [
      { id: "idle", width: 80, height: 40 },
      { id: "active", width: 10, height: 10 },
      { id: "active.loading", parentId: "active", width: 90, height: 40 },
      { id: "active.ready", parentId: "active", width: 90, height: 40 },
      { id: "done", width: 10, height: 10 },
      { id: "done.saved", parentId: "done", width: 80, height: 40 },
    ],
    edges: [
      { id: "start", sourceId: "idle", targetId: "active.loading" },
      { id: "loaded", sourceId: "active.loading", targetId: "active.ready" },
      { id: "save", sourceId: "active.ready", targetId: "done.saved" },
    ],
  });

type Rect = { x: number; y: number; width: number; height: number };
function world(graph: Awaited<ReturnType<typeof getLayout>>["graph"]) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const at = (id: string): Rect => {
    const node = byId.get(id)!;
    const parent = node.parentId == null ? { x: 0, y: 0 } : at(node.parentId);
    return { x: parent.x + node.x, y: parent.y + node.y, width: node.width, height: node.height };
  };
  return new Map(graph.nodes.map((n) => [n.id, at(n.id)]));
}
const inside = (child: Rect, parent: Rect) =>
  child.x >= parent.x - 1e-6 &&
  child.y >= parent.y - 1e-6 &&
  child.x + child.width <= parent.x + parent.width + 1e-6 &&
  child.y + child.height <= parent.y + parent.height + 1e-6;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function expectSound(result: Awaited<ReturnType<typeof getLayout>>) {
  const rects = world(result.graph);
  for (const node of result.graph.nodes) {
    if (node.parentId != null)
      expect(inside(rects.get(node.id)!, rects.get(node.parentId)!)).toBe(true);
    for (const other of result.graph.nodes)
      if (other.id < node.id && other.parentId === node.parentId)
        expect(overlaps(rects.get(node.id)!, rects.get(other.id)!), `${node.id}/${other.id}`).toBe(
          false,
        );
  }
  for (const edge of result.graph.edges)
    for (const [a, b] of (edge.points ?? []).slice(1).map((p, i) => [edge.points![i]!, p] as const))
      expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, edge.id).toBe(true);
}

describe("geometry constraints with containers", () => {
  it("keeps unconstrained compound layouts unchanged", async () => {
    const plain = await getLayout({ graph: statechart() });
    const empty = await getLayout({ graph: statechart(), constraints: [] });
    expect(empty.graph).toEqual(plain.graph);
  });

  it("moves a container with its children", async () => {
    const plain = await getLayout({ graph: statechart() });
    const before = world(plain.graph);
    const result = await getLayout({
      graph: statechart(),
      constraints: [
        c.pin({ id: "pin", entity: { nodeId: "done" }, y: before.get("done")!.y + 120 }),
      ],
    });
    const after = world(result.graph);
    expect(after.get("done")!.y).toBeCloseTo(before.get("done")!.y + 120);
    expect(after.get("done.saved")!.y - after.get("done")!.y).toBeCloseTo(
      before.get("done.saved")!.y - before.get("done")!.y,
    );
    expectSound(result);
  });

  it("grows a container to keep a moved child inside", async () => {
    const plain = await getLayout({ graph: statechart() });
    const before = world(plain.graph);
    const result = await getLayout({
      graph: statechart(),
      constraints: [
        c.pin({
          id: "pin",
          entity: { nodeId: "active.ready" },
          x: before.get("active")!.x + before.get("active")!.width + 60,
        }),
      ],
    });
    const after = world(result.graph);
    expect(after.get("active")!.width).toBeGreaterThan(before.get("active")!.width);
    expectSound(result);
  });

  it("aligns states across containers", async () => {
    const result = await getLayout({
      graph: statechart(),
      constraints: [
        c.align({
          id: "middles",
          entities: [{ nodeId: "idle" }, { nodeId: "done.saved" }],
          axis: "y",
          anchor: "end",
        }),
      ],
    });
    const after = world(result.graph);
    const bottom = (r: Rect) => r.y + r.height;
    expect(bottom(after.get("idle")!)).toBeCloseTo(bottom(after.get("done.saved")!));
    expectSound(result);
  });

  it("refuses a required constraint that would overlap siblings", async () => {
    // done sits right of active, so their children cannot share a center x.
    await expect(
      getLayout({
        graph: statechart(),
        constraints: [
          c.align({
            id: "centers",
            entities: [{ nodeId: "active.ready" }, { nodeId: "done.saved" }],
            axis: "x",
          }),
        ],
      }),
    ).rejects.toMatchObject({ code: "UNSATISFIED_CONSTRAINT" });
  });

  it("relaxes a preferred constraint that would overlap siblings", async () => {
    const result = await getLayout({
      graph: statechart(),
      constraints: [
        c.align({
          id: "centers",
          entities: [{ nodeId: "active.ready" }, { nodeId: "done.saved" }],
          axis: "x",
          strength: "strong",
        }),
      ],
    });
    expect(result.diagnostics.some((d) => d.code === "CONSTRAINT_VIOLATION")).toBe(true);
    expectSound(result);
  });

  it("constrains a real statechart with nested states", async () => {
    const graph = createGraph(espresso as never);
    const options = {
      spacing: { node: 48, layer: 64 },
      settings: { separateConnectedComponents: false, "cycleBreaking.strategy": "MODEL_ORDER" },
    } as const;
    const result = await getLayout({
      graph,
      options,
      constraints: [
        c.align({
          id: "idle-with-empty",
          entities: [
            { nodeId: "espressoBar.intake.idle" },
            { nodeId: "espressoBar.portafilter.empty" },
          ],
          axis: "y",
          strength: "strong",
        }),
      ],
    });
    expectSound(result);
  });
});
