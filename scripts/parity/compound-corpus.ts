import type { ElkNode } from "../../src/elkjs/types";

/** Original diagnostic sequence: changing RNG calls changes the saved corpus. */
export function compoundFixture(seed: number, direction = "RIGHT"): ElkNode {
  let state = seed >>> 0;
  const random = (limit: number): number =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % limit;
  const children: ElkNode[] = [];
  const leaves: { node: ElkNode; owner: ElkNode | null }[] = [];
  for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
    const group: ElkNode = { id: `g${groupIndex}`, children: [], edges: [] };
    children.push(group);
    // Intentionally retains the original per-iteration draw (2–4 leaves).
    for (let index = 0; index < 2 + random(3); index++) {
      const node = {
        id: `n${leaves.length}`,
        width: 30 + random(3) * 10,
        height: 20 + random(3) * 10,
      };
      group.children!.push(node);
      leaves.push({ node, owner: group });
    }
  }
  const outside = { id: "outside", width: 30, height: 20 };
  children.push(outside);
  leaves.push({ node: outside, owner: null });
  const edges: NonNullable<ElkNode["edges"]> = [];
  let edgeIndex = 0;
  for (let source = 0; source < leaves.length; source++) {
    for (let target = source + 1; target < leaves.length; target++) {
      if (random(5) !== 0) continue;
      const edge = {
        id: `e${edgeIndex++}`,
        sources: [leaves[source]!.node.id!],
        targets: [leaves[target]!.node.id!],
      };
      const owner = leaves[source]!.owner === leaves[target]!.owner ? leaves[source]!.owner : null;
      (owner?.edges ?? edges).push(edge);
    }
  }
  edges.push({ id: `e${edgeIndex++}`, sources: [leaves[0]!.node.id!], targets: ["outside"] });
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children,
    edges,
  };
}

/** Geometry, topology and container ownership; only runtime metadata omitted. */
export function compoundGeometry(node: ElkNode): unknown {
  const point = (value: { x: number; y: number }) => ({ x: value.x, y: value.y });
  const shape = (value: { x?: number; y?: number; width?: number; height?: number }) => ({
    x: value.x ?? 0,
    y: value.y ?? 0,
    width: value.width ?? 0,
    height: value.height ?? 0,
  });
  return {
    id: node.id,
    ...shape(node),
    children: (node.children ?? []).map(compoundGeometry),
    ports: (node.ports ?? []).map((port) => ({
      id: port.id,
      ...shape(port),
      labels: (port.labels ?? []).map((label) => ({ text: label.text, ...shape(label) })),
    })),
    labels: (node.labels ?? []).map((label) => ({ text: label.text, ...shape(label) })),
    edges: (node.edges ?? []).map((edge) => ({
      id: edge.id,
      container: (edge as typeof edge & { container?: string }).container,
      sources: edge.sources ?? [edge.source],
      targets: edge.targets ?? [edge.target],
      labels: (edge.labels ?? []).map((label) => ({ text: label.text, ...shape(label) })),
      sections: (edge.sections ?? []).map((section) => ({
        start: point(section.startPoint),
        end: point(section.endPoint),
        bends: (section.bendPoints ?? []).map(point),
        incoming: section.incomingShape,
        outgoing: section.outgoingShape,
        incomingSections:
          (section as typeof section & { incomingSections?: string[] }).incomingSections ?? [],
        outgoingSections:
          (section as typeof section & { outgoingSections?: string[] }).outgoingSections ?? [],
      })),
      junctions: (edge.junctionPoints ?? []).map(point),
    })),
  };
}

export interface GeometryDifference {
  path: string;
  actual: unknown;
  expected: unknown;
}
export function geometryDifferences(
  actual: unknown,
  expected: unknown,
  path = "$",
): GeometryDifference[] {
  if (typeof actual === "number" && typeof expected === "number") {
    return Number.isFinite(actual) &&
      Number.isFinite(expected) &&
      Math.abs(actual - expected) < 5e-13
      ? []
      : [{ path, actual, expected }];
  }
  if (actual === expected) return [];
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    if (Array.isArray(actual) !== Array.isArray(expected)) return [{ path, actual, expected }];
    const a = actual as Record<string, unknown>,
      b = expected as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((key) => geometryDifferences(a[key], b[key], `${path}.${key}`));
  }
  return [{ path, actual, expected }];
}
