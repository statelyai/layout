import type { ElkEdge, ElkNode, ElkPort } from "../../src/elkjs/types";

/** v1: preserve this draw sequence; larger hierarchy coverage supplements existing corpora. */
export function complexCompoundFixture(seed: number, direction = "RIGHT"): ElkNode {
  let state = seed >>> 0 || 0x9e3779b9;
  const random = (limit: number): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
  const family = seed % 4;
  const root: ElkNode = {
    id: "root",
    children: [],
    edges: [],
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.separateConnectedComponents": false,
    },
  };
  const leaves: { node: ElkNode; ancestors: ElkNode[] }[] = [];
  const sides = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
  let groupId = 0;
  const addLeaf = (owner: ElkNode, ancestors: ElkNode[]) => {
    const index = leaves.length;
    const width = 80 + random(5) * 20;
    const height = 60 + random(5) * 16;
    const node: ElkNode = { id: `n${index}`, width, height };
    if (family === 1 || family === 2) {
      const rotation = random(4);
      const count = 1 + random(6);
      node.layoutOptions = { "elk.portConstraints": family === 2 ? "FIXED_POS" : "FIXED_SIDE" };
      node.ports = Array.from({ length: count }, (_, portIndex): ElkPort => {
        const side = sides[(rotation + portIndex) % 4]!;
        const peers = Math.floor((count - 1 - (portIndex % 4)) / 4) + 1;
        const fraction = (Math.floor(portIndex / 4) + 1) / (peers + 1);
        const port: ElkPort = {
          id: `${node.id}:p${portIndex}`,
          width: 4,
          height: 4,
          layoutOptions: { "elk.port.side": side },
        };
        if (family === 2) {
          port.x = side === "WEST" ? -4 : side === "EAST" ? width : width * fraction - 2;
          port.y = side === "NORTH" ? -4 : side === "SOUTH" ? height : height * fraction - 2;
        }
        return port;
      });
    }
    if (family === 3) node.labels = [{ text: String(node.id), width: 30, height: 14 }];
    owner.children!.push(node);
    leaves.push({ node, ancestors });
  };
  const addGroup = (owner: ElkNode, ancestors: ElkNode[], depth: number) => {
    const group: ElkNode = { id: `g${groupId++}`, children: [], edges: [] };
    owner.children!.push(group);
    const path = [...ancestors, group];
    const count = 2 + random(4);
    for (let index = 0; index < count; index++) addLeaf(group, path);
    if (depth < 3 && random(3) !== 0) addGroup(group, path, depth + 1);
  };
  const groupCount = 2 + random(2);
  for (let index = 0; index < groupCount; index++) addGroup(root, [root], 1);
  const outsideCount = 1 + random(3);
  for (let index = 0; index < outsideCount; index++) addLeaf(root, [root]);
  let edgeId = 0;
  const connect = (sourceIndex: number, targetIndex: number) => {
    const source = leaves[sourceIndex]!;
    const target = leaves[targetIndex]!;
    const endpoint = (node: ElkNode) =>
      node.ports?.length ? node.ports[random(node.ports.length)]!.id! : node.id!;
    const edge: ElkEdge = {
      id: `e${edgeId++}`,
      sources: [endpoint(source.node)],
      targets: [endpoint(target.node)],
    };
    if (family === 3 && edgeId % 4 === 0)
      edge.labels = [{ text: String(edge.id), width: 32, height: 14 }];
    let owner = root;
    for (
      let index = 0;
      index < Math.min(source.ancestors.length, target.ancestors.length);
      index++
    ) {
      if (source.ancestors[index] !== target.ancestors[index]) break;
      owner = source.ancestors[index]!;
    }
    owner.edges!.push(edge);
  };
  // Connect every leaf, including transitions between groups and nesting levels.
  for (let index = 1; index < leaves.length; index++) connect(index - 1, index);
  const extras = leaves.length + random(leaves.length);
  for (let index = 0; index < extras; index++) {
    let source = random(leaves.length),
      target = random(leaves.length);
    if (family === 0) {
      if (source === target) target = (target + 1) % leaves.length;
      if (source > target) [source, target] = [target, source];
    }
    connect(source, target);
  }
  if (family !== 0) {
    connect(leaves.length - 1, 0);
    const loop = random(leaves.length);
    connect(loop, loop);
  }
  return root;
}
