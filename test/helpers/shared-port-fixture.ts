import type { ElkNode } from "../../src/elkjs/types";
export function sharedPortFixture(
  seed: number,
  direction: "RIGHT" | "LEFT" | "DOWN" | "UP" = "RIGHT",
): ElkNode {
  let state = seed;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const leftCount = 2 + Math.floor(random() * 3),
    rightCount = 2 + Math.floor(random() * 3);
  const children = Array.from({ length: leftCount + rightCount }, (_, i) => {
    const left = i < leftCount,
      width = 30 + Math.floor(random() * 31),
      height = 20 + Math.floor(random() * 31);
    return {
      id: `n${i}`,
      width,
      height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: [
        {
          id: `p${i}`,
          x:
            direction === "RIGHT"
              ? left
                ? width
                : 0
              : direction === "LEFT"
                ? left
                  ? 0
                  : width
                : width / 2,
          y:
            direction === "DOWN"
              ? left
                ? height
                : 0
              : direction === "UP"
                ? left
                  ? 0
                  : height
                : height / 2,
          width: 0,
          height: 0,
          layoutOptions: {
            "elk.port.side":
              direction === "RIGHT"
                ? left
                  ? "EAST"
                  : "WEST"
                : direction === "LEFT"
                  ? left
                    ? "WEST"
                    : "EAST"
                  : direction === "DOWN"
                    ? left
                      ? "SOUTH"
                      : "NORTH"
                    : left
                      ? "NORTH"
                      : "SOUTH",
          },
        },
      ],
    };
  });
  const edges: NonNullable<ElkNode["edges"]> = [];
  for (let source = 0; source < leftCount; source++)
    for (let target = leftCount; target < children.length; target++)
      if (random() < 0.5)
        edges.push({
          id: `e${source}-${target}`,
          sources: [`p${source}`],
          targets: [`p${target}`],
        });
  if (!edges.length) edges.push({ id: "fallback", sources: ["p0"], targets: [`p${leftCount}`] });
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.separateConnectedComponents": "false",
    },
    children,
    edges,
  };
}
