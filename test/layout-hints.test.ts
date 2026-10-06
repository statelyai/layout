import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { getLayeredLayout, getLayout, hint, statechartHints } from "../src";
import editor from "./fixtures/editor-modes-native.json";
import espresso from "./fixtures/espresso-native.json";
import { isSoftRegression, measureSoftQuality } from "../src/layered/hints";

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function expectSound(result: ReturnType<typeof getLayeredLayout>) {
  for (const a of result.nodes)
    for (const b of result.nodes)
      if (a.id < b.id && a.parentId === b.parentId)
        expect(overlaps(a, b), `${a.id}/${b.id}`).toBe(false);
  for (const edge of result.edges)
    for (const [index, point] of (edge.points ?? []).entries()) {
      const previous = edge.points![index - 1];
      if (previous)
        expect(Math.abs(previous.x - point.x) < 1e-6 || Math.abs(previous.y - point.y) < 1e-6).toBe(
          true,
        );
    }
}

// A login flow: the initial state has incoming edges and sits mid-layer without hints.
const flow = () =>
  createGraph({
    nodes: ["form", "checking", "error", "welcome", "idle"].map((id) => ({
      id,
      width: 90,
      height: 40,
    })),
    edges: [
      { id: "submit", sourceId: "form", targetId: "checking" },
      { id: "fail", sourceId: "checking", targetId: "error" },
      { id: "retry", sourceId: "error", targetId: "form" },
      { id: "ok", sourceId: "checking", targetId: "welcome" },
      { id: "start", sourceId: "idle", targetId: "form" },
      { id: "reset", sourceId: "welcome", targetId: "idle" },
    ],
  });

describe("layout hints", () => {
  it("changes nothing without hints", () => {
    expect(getLayeredLayout(flow(), { hints: [] })).toEqual(getLayeredLayout(flow()));
  });

  it("anchors the initial state at the top-left", () => {
    const result = getLayeredLayout(flow(), {
      direction: "right",
      hints: [hint.anchor({ id: "initial", nodeId: "idle", corner: "start", strength: "require" })],
    });
    const idle = result.nodes.find((n) => n.id === "idle")!;
    expect(idle.x).toBe(Math.min(...result.nodes.map((n) => n.x)));
    expect(idle.y).toBe(Math.min(...result.nodes.map((n) => n.y)));
    expectSound(result);
  });

  it("aligns sequential states on one center line", () => {
    const result = getLayeredLayout(flow(), {
      direction: "down",
      hints: [
        hint.chain({
          id: "happy-path",
          nodeIds: ["form", "checking", "welcome"],
          strength: "require",
        }),
      ],
    });
    const center = (id: string) => {
      const node = result.nodes.find((n) => n.id === id)!;
      return node.x + node.width / 2;
    };
    expect(center("checking")).toBeCloseTo(center("form"));
    expect(center("welcome")).toBeCloseTo(center("form"));
    expectSound(result);
  });

  it("anchors inside a container", () => {
    const graph = createGraph({
      nodes: [
        { id: "machine", width: 10, height: 10 },
        ...["a", "b", "c", "init"].map((id) => ({
          id,
          parentId: "machine",
          width: 80,
          height: 40,
        })),
      ],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "ac", sourceId: "a", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
        { id: "go", sourceId: "init", targetId: "b" },
      ],
    });
    const result = getLayeredLayout(graph, {
      direction: "right",
      hints: [hint.anchor({ id: "initial", nodeId: "init", corner: "start", strength: "require" })],
    });
    const children = result.nodes.filter((n) => n.parentId === "machine");
    const init = children.find((n) => n.id === "init")!;
    expect(init.x).toBe(Math.min(...children.map((n) => n.x)));
    expect(init.y).toBe(Math.min(...children.map((n) => n.y)));
    expectSound(result);
  });

  it.each(["right", "down"] as const)(
    "never keeps a preferred hint that makes the layout worse (%s)",
    async (direction) => {
      const plain = await getLayout({ graph: flow(), options: { direction } });
      const result = await getLayout({
        graph: flow(),
        options: {
          direction,
          hints: [
            hint.anchor({ id: "initial", nodeId: "idle", corner: "start" }),
            hint.chain({ id: "happy-path", nodeIds: ["form", "checking", "welcome"] }),
          ],
        },
      });
      expect(
        isSoftRegression(measureSoftQuality(result.graph), measureSoftQuality(plain.graph)),
      ).toBe(false);
    },
  );

  it("derives statechart hints from initial states and one-to-one runs", () => {
    const graph = createGraph({
      initialNodeId: "idle",
      nodes: [
        { id: "idle", width: 80, height: 40 },
        { id: "busy", width: 10, height: 10, initialNodeId: "busy.fetch" },
        ...["fetch", "parse", "store"].map((id) => ({
          id: `busy.${id}`,
          parentId: "busy",
          width: 80,
          height: 40,
        })),
      ],
      edges: [
        { id: "go", sourceId: "idle", targetId: "busy" },
        { id: "fetched", sourceId: "busy.fetch", targetId: "busy.parse" },
        { id: "parsed", sourceId: "busy.parse", targetId: "busy.store" },
        { id: "back", sourceId: "busy", targetId: "idle" },
      ],
    });
    const hints = statechartHints(graph);
    expect(hints).toEqual([
      expect.objectContaining({ kind: "anchor", nodeId: "idle", strength: "require" }),
      expect.objectContaining({ kind: "anchor", nodeId: "busy.fetch", strength: "require" }),
      expect.objectContaining({
        kind: "chain",
        nodeIds: ["busy.fetch", "busy.parse", "busy.store"],
      }),
    ]);
    const result = getLayeredLayout(graph, { direction: "right", hints });
    const children = result.nodes.filter((n) => n.parentId === "busy");
    const fetch = children.find((n) => n.id === "busy.fetch")!;
    expect(fetch.x).toBe(Math.min(...children.map((n) => n.x)));
    expectSound(result);
  });

  it("keeps the Stately fixtures defect-free with statechart hints", () => {
    for (const fixture of [editor, espresso])
      for (const direction of ["right", "down"] as const) {
        const graph = createGraph(fixture as never);
        expectSound(getLayeredLayout(graph, { direction, hints: statechartHints(graph) }));
      }
  });
});
