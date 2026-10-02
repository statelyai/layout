import { createGraph } from "@statelyai/graph";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import { crossesRect } from "../src/authoring/routing";

for (const direction of ["right", "left", "down", "up"] as const) {
  for (const invertedSource of [true, false]) {
    it(`routes an inverted ${invertedSource ? "source" : "target"} port in its own layer (${direction})`, async () => {
      const horizontal = direction === "right" || direction === "left";
      const backward = { right: "WEST", left: "EAST", down: "NORTH", up: "SOUTH" } as const;
      const forward = { right: "EAST", left: "WEST", down: "SOUTH", up: "NORTH" } as const;
      const side = (invertedSource ? backward : forward)[direction];
      const nodes = ["a", "b", "c"].map((id) => ({
        id,
        width: 80,
        height: 60,
        ...(id === "b"
          ? {
              ports: [
                {
                  name: "shared",
                  direction: "inout" as const,
                  x: side === "EAST" ? 80 : side === "WEST" ? 0 : 20,
                  y: side === "SOUTH" ? 60 : side === "NORTH" ? 0 : 20,
                  width: 6,
                  height: 6,
                },
              ],
            }
          : {}),
      }));
      const edges = [
        { id: "ab", sourceId: "a", targetId: "b", targetPort: "shared" },
        { id: "bc", sourceId: "b", sourcePort: "shared", targetId: "c" },
      ];
      const oracle: ElkNode = await new ELK().layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": direction.toUpperCase(),
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
            layoutOptions: { "elk.port.side": side },
          })),
        })),
        edges: edges.map((e) => ({
          id: e.id,
          sources: [e.sourcePort ? `${e.sourceId}:${e.sourcePort}` : e.sourceId],
          targets: [e.targetPort ? `${e.targetId}:${e.targetPort}` : e.targetId],
        })),
      });
      const native = getLayeredLayout(createGraph({ nodes, edges }), {
        direction,
        settings: { separateConnectedComponents: false },
        nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
        portSettings: () => ({ "port.side": side }),
      });
      expect(native.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
      expect(native.edges.map((e) => e.id)).toEqual(["ab", "bc"]);
      for (const edge of native.edges) {
        const points = edge.points!;
        const bends = points.slice(1, -1).filter((p, i) => {
          const a = points[i]!,
            b = points[i + 2]!;
          return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-8;
        }).length;
        expect(bends).toBe(
          oracle
            .edges!.find((e) => e.id === edge.id)!
            .sections!.reduce((sum, s) => sum + (s.bendPoints?.length ?? 0), 0),
        );
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!,
            b = points[i]!;
          expect(a.x === b.x || a.y === b.y).toBe(true);
          for (const node of native.nodes) expect(crossesRect(a, b, node)).toBe(false);
        }
      }
      if (invertedSource) {
        const n = native.nodes.find((n) => n.id === "c")!,
          b = native.nodes.find((n) => n.id === "b")!;
        const e = oracle.children!.find((n) => n.id === "c")!,
          eb = oracle.children!.find((n) => n.id === "b")!;
        expect(horizontal ? n.y - b.y : n.x - b.x).toBe(horizontal ? e.y! - eb.y! : e.x! - eb.x!);
      }
    });
  }
}
