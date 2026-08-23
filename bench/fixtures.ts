import { createGraph } from "@statelyai/graph";

export function createLinearFixture(size: number) {
  return createGraph({
    id: `linear-${size}`,
    nodes: Array.from({ length: size }, (_, index) => ({
      id: `n${index}`,
      x: index * 3,
      y: (index % 17) * 5,
      width: 40 + (index % 3) * 4,
      height: 24 + (index % 5) * 2,
    })),
    edges: Array.from({ length: Math.max(0, size - 1) }, (_, index) => ({
      id: `e${index}`,
      sourceId: `n${index}`,
      targetId: `n${index + 1}`,
    })),
  });
}

export function createLayeredDagFixture(width: number, depth: number, longEdges = false) {
  const edges = Array.from({ length: depth - 1 }, (_, layer) =>
    Array.from({ length: width }, (_, column) => {
      const targets = [column, Math.min(width - 1, column + 1)];
      const adjacent = targets.map((targetColumn, branch) => ({
        id: `e${layer}-${column}-${branch}`,
        sourceId: `n${layer * width + column}`,
        targetId: `n${(layer + 1) * width + targetColumn}`,
      }));
      if (!longEdges || layer + 3 >= depth) return adjacent;
      return [
        ...adjacent,
        {
          id: `long-${layer}-${column}`,
          sourceId: `n${layer * width + column}`,
          targetId: `n${(layer + 3) * width + ((column + 2) % width)}`,
        },
      ];
    }),
  ).flat(2);

  return createGraph({
    id: `layered-dag-${width}-${depth}-${longEdges ? "long" : "short"}`,
    nodes: Array.from({ length: width * depth }, (_, index) => ({
      id: `n${index}`,
      width: 40 + (index % 3) * 4,
      height: 24 + (index % 5) * 2,
    })),
    edges,
  });
}

export function createDeepCompoundFixture(depth: number) {
  return createGraph({
    id: `deep-compound-${depth}`,
    nodes: Array.from({ length: depth }, (_, index) => ({
      id: `n${index}`,
      ...(index === 0 ? {} : { parentId: `n${index - 1}` }),
      width: 40,
      height: 24,
    })),
    edges: Array.from({ length: Math.max(0, depth - 1) }, (_, index) => ({
      id: `e${index}`,
      sourceId: `n${index + 1}`,
      targetId: `n${index}`,
    })),
  });
}
