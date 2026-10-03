import type { ElkEdge, ElkNode, ElkPort } from "../../src/elkjs/types";

/** v1: retain the draw sequence so saved failures remain reproducible. */
export function flatFixture(seed: number, direction = "RIGHT"): ElkNode {
  let state = seed >>> 0;
  const random = (limit: number) =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % limit;
  const family = seed % 5;
  const count = 4 + random(13);
  const children: ElkNode[] = [];
  const sides = ["NORTH", "EAST", "SOUTH", "WEST"];
  for (let index = 0; index < count; index++) {
    const width = 60 + random(5) * 20,
      height = 48 + random(4) * 16;
    const node: ElkNode = { id: `n${index}`, width, height };
    if (family === 2 || family === 3) {
      const portCount = 1 + random(4),
        rotation = random(4);
      node.layoutOptions = { "elk.portConstraints": family === 3 ? "FIXED_POS" : "FIXED_SIDE" };
      node.ports = Array.from({ length: portCount }, (_, portIndex): ElkPort => {
        const side = sides[(rotation + portIndex) % 4]!;
        const port: ElkPort = {
          id: `n${index}:p${portIndex}`,
          width: 4,
          height: 4,
          layoutOptions: { "elk.port.side": side },
        };
        if (family === 3) {
          port.x = side === "WEST" ? -4 : side === "EAST" ? width : width / 2 - 2;
          port.y = side === "NORTH" ? -4 : side === "SOUTH" ? height : height / 2 - 2;
        }
        return port;
      });
    }
    if (family === 4) node.labels = [{ text: `N${index}`, width: 24, height: 12 }];
    children.push(node);
  }
  const edges: ElkEdge[] = [];
  const endpoint = (index: number) => {
    const node = children[index]!;
    return node.ports?.length ? node.ports[random(node.ports.length)]!.id! : node.id!;
  };
  const connect = (source: number, target: number) => {
    const edge: ElkEdge = {
      id: `e${edges.length}`,
      sources: [endpoint(source)],
      targets: [endpoint(target)],
    };
    if (family === 4 && edges.length % 3 === 0)
      edge.labels = [{ text: `E${edges.length}`, width: 32, height: 14 }];
    edges.push(edge);
  };
  for (let index = 1; index < count; index++) connect(index - 1, index);
  const extras = random(count * 2 + 1);
  for (let index = 0; index < extras; index++) {
    let source = random(count),
      target = random(count);
    if (family === 0) {
      if (source === target) target = (target + 1) % count;
      if (source > target) [source, target] = [target, source];
    }
    connect(source, target);
  }
  if (family !== 0) {
    connect(count - 1, 0);
    const loop = random(count);
    connect(loop, loop);
  }
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.separateConnectedComponents": false,
    },
    children,
    edges,
  };
}
