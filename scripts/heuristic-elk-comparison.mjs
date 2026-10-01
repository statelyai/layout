// Adapt the same native inputs to the actual elkjs runtime (not the Stately facade).
export function toElkInput(input, direction) {
  const root = {
    id: "__root",
    children: [],
    edges: [],
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction.toUpperCase(),
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.edgeLabels.placement": "CENTER",
    },
  };
  const compounds = new Set(input.nodes.map((n) => n.parentId).filter(Boolean));
  const nodes = new Map(
    input.nodes.map((n) => [
      n.id,
      {
        id: n.id,
        width: n.width,
        height: n.height,
        ...(compounds.has(n.id) ? { children: [], edges: [] } : {}),
        layoutOptions: {
          ...root.layoutOptions,
          "elk.portConstraints": "FIXED_POS",
          ...(compounds.has(n.id) ? { "elk.padding": "[top=60,left=24,bottom=24,right=24]" } : {}),
        },
        ports: (n.ports ?? []).map((p) => ({
          id: `${n.id}:${p.name}`,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          layoutOptions: { "elk.port.side": p.data.side },
        })),
      },
    ]),
  );
  for (const n of input.nodes)
    (n.parentId ? nodes.get(n.parentId) : root).children.push(nodes.get(n.id));
  const chain = (id) => {
    const result = [];
    let n = input.nodes.find((n) => n.id === id);
    while (n) {
      result.push(n.id);
      n = input.nodes.find((p) => p.id === n.parentId);
    }
    return result;
  };
  for (const e of input.edges) {
    const a = chain(e.sourceId),
      b = chain(e.targetId);
    const owner = a.find((id) => b.includes(id) && compounds.has(id));
    (owner ? nodes.get(owner) : root).edges.push({
      id: e.id,
      sources: [e.sourcePort ? `${e.sourceId}:${e.sourcePort}` : e.sourceId],
      targets: [e.targetPort ? `${e.targetId}:${e.targetPort}` : e.targetId],
      ...(e.width
        ? { labels: [{ id: `${e.id}:label`, text: e.id, width: e.width, height: e.height }] }
        : {}),
    });
  }
  return root;
}

export function fromElkOutput(root, input) {
  const nodes = [],
    edges = [],
    routes = new Map(),
    frames = new Map([[root.id, { x: 0, y: 0 }]]);
  const visitNodes = (parent, offset) => {
    for (const n of parent.children ?? []) {
      const original = input.nodes.find((node) => node.id === n.id);
      nodes.push({
        ...original,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        ports: (n.ports ?? []).map((p) => ({
          ...original.ports.find((port) => `${n.id}:${port.name}` === p.id),
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        })),
      });
      const world = { x: offset.x + n.x, y: offset.y + n.y };
      frames.set(n.id, world);
      visitNodes(n, world);
    }
  };
  visitNodes(root, { x: 0, y: 0 });
  const visitEdges = (parent) => {
    for (const e of parent.edges ?? []) {
      const original = input.edges.find((edge) => edge.id === e.id);
      const offset = frames.get(e.container ?? parent.id);
      if (!offset) throw new Error(`Unknown ELK edge container: ${e.container}`);
      const sections = (e.sections ?? []).map((s, index) => {
        const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
        }));
        return {
          id: `${e.id}:${index}`,
          from: { kind: "node", nodeId: original.sourceId },
          to: { kind: "node", nodeId: original.targetId },
          path: { start: points[0], segments: points.slice(1).map((to) => ({ kind: "line", to })) },
        };
      });
      if (!sections.length) throw new Error(`ELK returned no sections for ${e.id}`);
      routes.set(e.id, { edgeId: e.id, status: "routed", sections, diagnostics: [] });
      const label = e.labels?.[0];
      edges.push({ ...original, x: (label?.x ?? 0) + offset.x, y: (label?.y ?? 0) + offset.y });
    }
    for (const child of parent.children ?? []) visitEdges(child);
  };
  visitEdges(root);
  if (edges.length !== input.edges.length) throw new Error("ELK edge count changed");
  return { layout: { nodes, edges }, routes };
}
