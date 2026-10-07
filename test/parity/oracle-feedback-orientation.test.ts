import { createGraph } from "@statelyai/graph";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../../src";

for (const splitPorts of [false, true]) {
  it(`keeps a mixed-flow fixed-west node in the forward chain (${splitPorts ? "separate ports" : "shared port"})`, async () => {
    const ports = splitPorts ? ["in", "out"] : ["shared"];
    const nodes = ["a", "b", "c"].map((id) => ({
      id,
      width: 80,
      height: 60,
      ...(id === "b"
        ? {
            ports: ports.map((name, i) => ({
              name,
              direction: "inout" as const,
              width: 6,
              height: 6,
              x: 0,
              y: 20 + i * 20,
            })),
          }
        : {}),
    }));
    const edges = [
      { id: "ab", sourceId: "a", targetId: "b", targetPort: ports[0] },
      { id: "bc", sourceId: "b", targetId: "c", sourcePort: ports.at(-1) },
    ];
    const oracle: ElkNode = await new ELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
      },
      children: nodes.map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: n.ports?.map((p) => ({
          id: `${n.id}:${p.name}`,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          layoutOptions: { "elk.port.side": "WEST" },
        })),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sources: [e.sourcePort ? `${e.sourceId}:${e.sourcePort}` : e.sourceId],
        targets: [e.targetPort ? `${e.targetId}:${e.targetPort}` : e.targetId],
      })),
    });
    const native = getLayeredLayout(createGraph({ nodes, edges }), {
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
      portSettings: () => ({ "port.side": "WEST" }),
      settings: { separateConnectedComponents: false },
    });
    const order = (ns: ReadonlyArray<{ id: string; x?: number }>) =>
      [...ns].sort((a, b) => (a.x ?? 0) - (b.x ?? 0)).map((n) => n.id);
    expect(order(native.nodes)).toEqual(order(oracle.children ?? []));
    expect(order(native.nodes)).toEqual(["a", "b", "c"]);
  });
}

it("orients a whole feedback node before breaking a cycle, without changing authored edges", async () => {
  const nodes = [
    {
      id: "a",
      width: 80,
      height: 60,
      ports: [
        {
          name: "out",
          direction: "out" as const,
          x: 0,
          y: 30,
          width: 6,
          height: 6,
          data: { side: "WEST" },
        },
        {
          name: "in",
          direction: "in" as const,
          x: 80,
          y: 30,
          width: 6,
          height: 6,
          data: { side: "EAST" },
        },
      ],
    },
    { id: "b", width: 80, height: 60 },
    { id: "c", width: 80, height: 60 },
  ];
  const edges = [
    { id: "ab", sourceId: "a", targetId: "b", sourcePort: "out" },
    { id: "bc", sourceId: "b", targetId: "c" },
    { id: "ca", sourceId: "c", targetId: "a", targetPort: "in" },
  ];
  const graph = createGraph({ nodes, edges });
  const before = structuredClone(graph.edges);
  const oracle: ElkNode = await new ELK().layout({
    id: "root",
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: n.ports?.map((p) => ({
        id: `${n.id}:${p.name}`,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        layoutOptions: { "elk.port.side": p.data.side },
      })),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.sourcePort ? `${e.sourceId}:${e.sourcePort}` : e.sourceId],
      targets: [e.targetPort ? `${e.targetId}:${e.targetPort}` : e.targetId],
    })),
  });
  const native = getLayeredLayout(graph, {
    nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
    portSettings: (p) => ({ "port.side": p.data.side as "WEST" | "EAST" }),
  });
  const order = (ns: ReadonlyArray<{ id: string; x?: number }>) =>
    [...ns].sort((a, b) => (a.x ?? 0) - (b.x ?? 0)).map((n) => n.id);
  expect(order(native.nodes)).toEqual(order(oracle.children ?? []));
  expect(order(native.nodes)).toEqual(["b", "a", "c"]);
  expect(graph.edges).toEqual(before);
});

for (const direction of ["right", "left", "down", "up"] as const) {
  it(`keeps implicit fixed-side feedback endpoints on their authored flow sides (${direction})`, async () => {
    const nodes = ["a", "b", "c"].map((id) => ({ id, width: 80, height: 60 }));
    const edges = [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "bc", sourceId: "b", targetId: "c" },
      { id: "ca", sourceId: "c", targetId: "a" },
    ];
    const oracle: ElkNode = await new ELK().layout({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction.toUpperCase() },
      children: nodes.map((n) => ({ ...n, layoutOptions: { "elk.portConstraints": "FIXED_POS" } })),
      edges: edges.map((e) => ({ id: e.id, sources: [e.sourceId], targets: [e.targetId] })),
    });
    const native = getLayeredLayout(createGraph({ nodes, edges }), {
      direction,
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
    });
    const source = native.nodes.find((n) => n.id === "c")!;
    const oracleSource = oracle.children!.find((n) => n.id === "c")!;
    const oracleStart = oracle.edges!.find((e) => e.id === "ca")!.sections![0]!.startPoint;
    const start = native.edges.find((e) => e.id === "ca")!.points![0]!;
    const axis = direction === "right" || direction === "left" ? "x" : "y";
    const extent = axis === "x" ? oracleSource.width : oracleSource.height;
    expect(oracleStart[axis] - oracleSource[axis]!).toBe(
      direction === "right" || direction === "down" ? extent : 0,
    );
    expect(start[axis] - source[axis]).toBe(oracleStart[axis] - oracleSource[axis]!);
  });
}
