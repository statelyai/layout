import type { ElkEdge, ElkNode, ElkPort } from "../../src/elkjs/types";

/** v1 frozen sequence: includes authored compound constraints and ports. */
export function compoundOptionsFixture(seed: number, direction = "RIGHT"): ElkNode {
  let state = seed >>> 0 || 1;
  const random = (limit: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
  const sides = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
  const constraints = ["FREE", "FIXED_SIDE", "FIXED_ORDER", "FIXED_POS"] as const;
  const root: ElkNode = {
    id: "root",
    children: [],
    edges: [],
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.separateConnectedComponents": false,
    },
  };
  const leaves: { node: ElkNode; ancestors: ElkNode[] }[] = [];
  const groups: { node: ElkNode; ancestors: ElkNode[] }[] = [];
  let nodeId = 0,
    groupId = 0,
    edgeId = 0;
  const ports = (node: ElkNode, count: number, mode: string): ElkPort[] => {
    const rotation = random(4);
    return Array.from({ length: count }, (_, index) => {
      const side = sides[(rotation + index) % 4]!;
      const port: ElkPort = {
        id: `${node.id}:p${index}`,
        width: 4,
        height: 4,
        layoutOptions: { "elk.port.side": side, "elk.port.index": index },
      };
      if (mode === "FIXED_POS") {
        port.x = side === "WEST" ? -4 : side === "EAST" ? node.width! : node.width! / 2 - 2;
        port.y = side === "NORTH" ? -4 : side === "SOUTH" ? node.height! : node.height! / 2 - 2;
      }
      return port;
    });
  };
  const leaf = (owner: ElkNode, ancestors: ElkNode[]) => {
    const node: ElkNode = {
      id: `n${nodeId++}`,
      width: 80 + random(5) * 20,
      height: 64 + random(4) * 16,
    };
    const mode = random(2) ? "FIXED_POS" : "FIXED_SIDE";
    node.layoutOptions = { "elk.portConstraints": mode };
    node.ports = ports(node, 1 + random(4), mode);
    if (seed % 3 === 0) node.labels = [{ text: String(node.id), width: 24, height: 12 }];
    owner.children!.push(node);
    leaves.push({ node, ancestors });
  };
  const group = (owner: ElkNode, ancestors: ElkNode[], depth: number) => {
    const mode = constraints[random(constraints.length)]!;
    const node: ElkNode = {
      id: `g${groupId++}`,
      width: 240,
      height: 200,
      children: [],
      edges: [],
      layoutOptions: { "elk.portConstraints": mode },
    };
    if (random(2)) node.ports = ports(node, 1 + random(2), mode);
    owner.children!.push(node);
    groups.push({ node, ancestors });
    const path = [...ancestors, node];
    const count = 2 + random(2);
    for (let i = 0; i < count; i++) leaf(node, path);
    if (depth < 3 && random(3) === 0) group(node, path, depth + 1);
  };
  if (seed % 5 === 0) {
    const count = 4 + random(4);
    for (let i = 0; i < count; i++) leaf(root, [root]);
  } else {
    const count = 1 + random(2);
    for (let i = 0; i < count; i++) group(root, [root], 1);
    leaf(root, [root]);
  }
  const endpoint = (node: ElkNode) => node.ports![random(node.ports!.length)]!.id!;
  const connect = (
    source: (typeof leaves)[number],
    target: (typeof leaves)[number],
    forcedOwner?: ElkNode,
  ) => {
    let owner = root;
    for (let i = 0; i < Math.min(source.ancestors.length, target.ancestors.length); i++) {
      if (source.ancestors[i] !== target.ancestors[i]) break;
      owner = source.ancestors[i]!;
    }
    const edge: ElkEdge = {
      id: `e${edgeId++}`,
      sources: [endpoint(source.node)],
      targets: [endpoint(target.node)],
    };
    if (seed % 3 === 0 && edgeId % 3 === 0)
      edge.labels = [{ text: String(edge.id), width: 24, height: 12 }];
    (forcedOwner ?? owner).edges!.push(edge);
  };
  for (let i = 1; i < leaves.length; i++) connect(leaves[i - 1]!, leaves[i]!);
  const extras = 2 + random(leaves.length);
  for (let i = 0; i < extras; i++)
    connect(leaves[random(leaves.length)]!, leaves[random(leaves.length)]!);
  if (seed % 2) connect(leaves.at(-1)!, leaves[0]!);
  for (const authored of groups.filter((g) => g.node.ports?.length)) {
    connect(authored, leaves.at(-1)!);
    if (seed % 7 === 0) {
      const descendant = leaves.find((l) => l.ancestors.includes(authored.node))!;
      connect(authored, descendant, root);
    }
  }
  return root;
}
