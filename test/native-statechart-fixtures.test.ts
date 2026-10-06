import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import editor from "./fixtures/editor-modes-native.json";
import espresso from "./fixtures/espresso-native.json";

for (const fixture of [editor, espresso])
  for (const direction of ["left", "right", "up", "down"] as const)
    it(`lays out ${fixture.id} without overlaps or consumer repairs (${direction})`, () => {
      const graph = createGraph(fixture);
      const parents = new Set(graph.nodes.map((n) => n.parentId));
      const result = getLayeredLayout(graph, {
        direction,
        padding: 48,
        spacing: { node: 48, layer: 64 },
        settings: { separateConnectedComponents: false, "cycleBreaking.strategy": "MODEL_ORDER" },
        compound: (node) =>
          parents.has(node.id)
            ? { header: { width: node.width!, height: node.height! } }
            : undefined,
      });
      const byId = new Map(result.nodes.map((n) => [n.id, n]));
      const world = (id: string) => {
        const n = byId.get(id)!;
        let x = n.x,
          y = n.y,
          p = n.parentId;
        while (p) {
          const parent = byId.get(p)!;
          x += parent.x;
          y += parent.y;
          p = parent.parentId;
        }
        return { x, y, width: n.width, height: n.height };
      };
      const intersects = (a: ReturnType<typeof world>, b: ReturnType<typeof world>) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      for (const a of result.nodes)
        for (const b of result.nodes)
          if (a.id < b.id && a.parentId === b.parentId)
            expect(intersects(world(a.id), world(b.id)), `${a.id} / ${b.id}`).toBe(false);
      const cards = result.nodes.map((n) => {
        const w = world(n.id),
          header = result.compoundGeometry.get(n.id)?.header;
        return header ? { ...header, x: w.x + header.x, y: w.y + header.y } : w;
      });
      for (const label of result.edges) {
        for (const card of cards) expect(intersects(label, card), label.id).toBe(false);
      }
      // Routes stay orthogonal through label gaps between route sections.
      for (const edge of result.edges)
        for (const [index, point] of (edge.points ?? []).entries()) {
          const previous = edge.points![index - 1];
          if (previous)
            expect(
              Math.abs(previous.x - point.x) < 1e-6 || Math.abs(previous.y - point.y) < 1e-6,
              edge.id,
            ).toBe(true);
        }
      for (let i = 0; i < result.edges.length; i++)
        for (let j = i + 1; j < result.edges.length; j++)
          expect(
            intersects(result.edges[i]!, result.edges[j]!),
            `${result.edges[i]!.id} / ${result.edges[j]!.id}`,
          ).toBe(false);
    });
