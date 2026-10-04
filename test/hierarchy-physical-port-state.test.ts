import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { complexCompoundFixture } from "../scripts/parity/complex-compound-corpus";

const topology = (root: ElkNode) => {
  const nodes: unknown[] = [],
    edges: unknown[] = [];
  const visit = (node: ElkNode, parent?: string) => {
    nodes.push({ id: node.id, parent, ports: (node.ports ?? []).map((port) => port.id).sort() });
    for (const edge of node.edges ?? [])
      edges.push({ id: edge.id, owner: node.id, sources: edge.sources, targets: edge.targets });
    for (const child of node.children ?? []) visit(child, String(node.id));
  };
  visit(root);
  const order = (a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b));
  return { nodes: nodes.sort(order), edges: edges.sort(order) };
};
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  it(`retains every physical hierarchy boundary through feedback reversal, seed 1 ${direction}`, async () => {
    const input = complexCompoundFixture(1, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    expect(topology(actual)).toEqual(topology(input));
    const visit = (node: ElkNode) => {
      expect([node.x ?? 0, node.y ?? 0, node.width, node.height].every(Number.isFinite)).toBe(true);
      for (const edge of node.edges ?? []) {
        expect(edge.sections?.length).toBeGreaterThan(0);
        for (const section of edge.sections ?? [])
          for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
            expect([point.x, point.y].every(Number.isFinite)).toBe(true);
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(actual);
  }, 30000);
}
