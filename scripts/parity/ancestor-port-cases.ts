import type { ElkNode } from "../../src/elkjs/types";

export function ancestorPortCase(
  constraints: string,
  storage: "root" | "compound",
  direction: string,
  side: string,
  role: "input" | "output",
): ElkNode {
  const input: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.separateConnectedComponents": false,
    },
    children: [
      {
        id: "g",
        width: 120,
        height: 100,
        layoutOptions: { "elk.portConstraints": constraints },
        ports: [
          {
            id: "gp",
            width: 4,
            height: 4,
            ...(constraints === "FIXED_POS"
              ? {
                  x: side === "WEST" ? -4 : side === "EAST" ? 120 : 58,
                  y: side === "NORTH" ? -4 : side === "SOUTH" ? 100 : 48,
                }
              : {}),
            layoutOptions: { "elk.port.side": side, "elk.port.index": 0 },
          },
        ],
        children: [{ id: "a", width: 80, height: 60 }],
        edges: [],
      },
      { id: "c", width: 80, height: 60 },
    ],
    edges: [{ id: "outside", sources: ["gp"], targets: ["c"] }],
  };
  (storage === "root" ? input : input.children![0]!).edges!.push({
    id: "ancestor",
    sources: [role === "input" ? "gp" : "a"],
    targets: [role === "input" ? "a" : "gp"],
  });
  return input;
}

export function ancestorNodeCase(
  constraints: string,
  storage: "root" | "compound",
  direction: string,
  role: "input" | "output",
): ElkNode {
  const input = ancestorPortCase(constraints, storage, direction, "WEST", role);
  delete input.children![0]!.ports;
  for (const owner of [input, input.children![0]!]) {
    for (const edge of owner.edges ?? []) {
      edge.sources = edge.sources?.map((id) => (id === "gp" ? "g" : id));
      edge.targets = edge.targets?.map((id) => (id === "gp" ? "g" : id));
    }
  }
  return input;
}
