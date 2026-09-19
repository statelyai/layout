import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { ElkEdge, ElkNode } from "../src/elkjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((value, index, values) =>
      value.startsWith("--") ? [[value.slice(2), values[index + 1]]] : [],
    ),
);
const beforePath = args.before;
const afterPath = args.after;
const outputDir = args.output;
if (!beforePath || !afterPath || !outputDir) {
  throw new Error(
    "Usage: tsx scripts/render-compact-label-spacing-proof.ts --before <elkjs.mjs> --after <elkjs.mjs> --output <dir>",
  );
}

const directions = ["DOWN", "UP", "RIGHT", "LEFT"] as const;
type Direction = (typeof directions)[number];
type Rect = { x: number; y: number; width: number; height: number };

function fixture(direction: Direction): ElkNode {
  const sourceSide =
    direction === "RIGHT"
      ? "EAST"
      : direction === "LEFT"
        ? "WEST"
        : direction === "UP"
          ? "NORTH"
          : "SOUTH";
  const targetSide =
    direction === "RIGHT"
      ? "WEST"
      : direction === "LEFT"
        ? "EAST"
        : direction === "UP"
          ? "SOUTH"
          : "NORTH";
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "30",
      "elk.layered.spacing.edgeNodeBetweenLayers": "10",
    },
    children: [
      {
        id: "source",
        width: 180,
        height: 96,
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: [
          {
            id: "source-port",
            width: 20,
            height: 20,
            layoutOptions: { "elk.port.side": sourceSide },
          },
        ],
      },
      {
        id: "target",
        width: 200,
        height: 96,
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: [
          {
            id: "target-port",
            width: 20,
            height: 20,
            layoutOptions: { "elk.port.side": targetSide },
          },
        ],
      },
    ],
    edges: [
      {
        id: "edge",
        sources: ["source-port"],
        targets: ["target-port"],
        labels: [
          {
            id: "label",
            text: "new event 1",
            width: 160,
            height: 48,
            layoutOptions: {
              "elk.edgeLabels.inline": "true",
              "elk.edgeLabels.placement": "CENTER",
            },
          },
        ],
      },
    ],
  };
}

async function layout(modulePath: string): Promise<Map<Direction, ElkNode>> {
  const module = (await import(pathToFileURL(modulePath).href)) as {
    default: new () => { layout(graph: ElkNode): Promise<ElkNode> };
  };
  return new Map(
    await Promise.all(
      directions.map(
        async (direction) =>
          [direction, await new module.default().layout(fixture(direction))] as const,
      ),
    ),
  );
}

const rect = (entity: ElkNode): Rect => ({
  x: entity.x ?? 0,
  y: entity.y ?? 0,
  width: entity.width ?? 0,
  height: entity.height ?? 0,
});
const intersects = (left: Rect, right: Rect): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

function validate(graph: ElkNode, direction: Direction): number {
  const horizontal = direction === "RIGHT" || direction === "LEFT";
  const axis = horizontal ? "x" : "y";
  const size = horizontal ? "width" : "height";
  const [source, target] = graph.children?.map(rect) ?? [];
  const label = graph.edges?.[0]?.labels?.[0];
  if (!source || !target || !label) throw new Error(`${direction}: missing rendered geometry`);
  const labelRect = rect(label as ElkNode);
  const [first, second] = [source, target].sort((left, right) => left[axis] - right[axis]);
  const corridorStart = first[axis] + first[size];
  const corridorEnd = second[axis];
  if (
    intersects(labelRect, source) ||
    intersects(labelRect, target) ||
    labelRect[axis] < corridorStart ||
    labelRect[axis] + labelRect[size] > corridorEnd
  ) {
    throw new Error(`${direction}: rendered label leaves its endpoint corridor`);
  }
  for (const section of graph.edges?.[0]?.sections ?? []) {
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!;
      const point = points[index]!;
      if (previous.x !== point.x && previous.y !== point.y) {
        throw new Error(`${direction}: rendered edge path is not orthogonal`);
      }
    }
  }
  return corridorEnd - corridorStart;
}

const escape = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

function panel(graph: ElkNode, direction: Direction, x: number, y: number): string {
  const nodes = graph.children?.map(rect) ?? [];
  const label = rect(graph.edges?.[0]?.labels?.[0] as ElkNode);
  const route = (graph.edges?.[0] as ElkEdge | undefined)?.sections
    ?.map((section) => {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      return `<polyline class="route" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"/>`;
    })
    .join("");
  const contentWidth = graph.width ?? Math.max(...nodes.map((node) => node.x + node.width));
  const scale = direction === "RIGHT" || direction === "LEFT" ? 0.6 : 0.9;
  const offsetX = (440 - contentWidth * scale) / 2;
  return `<g transform="translate(${x} ${y})"><text class="direction" x="20" y="36">${direction}</text><text class="metric" x="420" y="36" text-anchor="end">corridor ${validate(graph, direction)}px</text><g transform="translate(${offsetX} 60) scale(${scale})"><g>${route ?? ""}</g>${nodes.map((node, index) => `<rect class="state" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="10"/><text class="node-text" x="${node.x + node.width / 2}" y="${node.y + node.height / 2 + 7}" text-anchor="middle">${index === 0 ? "source" : "target"}</text>`).join("")}<rect class="label" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="22"/><text class="label-text" x="${label.x + label.width / 2}" y="${label.y + label.height / 2 + 7}" text-anchor="middle">${escape("new event 1")}</text></g></g>`;
}

function render(graphs: Map<Direction, ElkNode>, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><style>svg{background:#0c1018;font-family:ui-sans-serif,system-ui,sans-serif}.state{fill:#183c23;stroke:#35a854;stroke-width:3}.label{fill:#101b16;stroke:#35a854;stroke-width:3}.route{fill:none;stroke:#35a854;stroke-width:3}.heading{fill:#f5f7fb;font-size:28px;font-weight:800}.direction{fill:#f5f7fb;font-size:22px;font-weight:800}.metric{fill:#a9b3c7;font-size:16px}.node-text{fill:#f5f7fb;font-size:20px;font-weight:700}.label-text{fill:#f5f7fb;font-size:20px;font-weight:700}</style><text class="heading" x="30" y="42">${escape(title)}</text>${directions.map((direction, index) => panel(graphs.get(direction)!, direction, 30 + (index % 2) * 470, 70 + Math.floor(index / 2) * 450)).join("")}</svg>`;
}

const [before, after] = await Promise.all([layout(beforePath), layout(afterPath)]);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(`${outputDir}/before.svg`, render(before, "Before — Layout 0.1.2")),
  writeFile(`${outputDir}/after.svg`, render(after, "After — compact centered corridors")),
]);
