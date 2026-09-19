import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    "Usage: tsx scripts/render-label-overlap-proof.ts --before <elkjs.mjs> --after <elkjs.mjs> --output <dir>",
  );
}

const fixture = JSON.parse(
  await readFile(
    new URL("../test/fixtures/email-drafter-label-overlap.json", import.meta.url),
    "utf8",
  ),
) as ElkNode;

async function layout(modulePath: string): Promise<ElkNode> {
  const module = (await import(pathToFileURL(modulePath).href)) as {
    default: new () => { layout(graph: ElkNode): Promise<ElkNode> };
  };
  return new module.default().layout(structuredClone(fixture));
}

const [before, after] = await Promise.all([layout(beforePath), layout(afterPath)]);

type Rect = { id: string; x: number; y: number; width: number; height: number };
const rect = (entity: ElkNode): Rect => ({
  id: String(entity.id),
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
const labelsOf = (graph: ElkNode): Rect[] =>
  (graph.edges ?? []).flatMap((edge) => (edge.labels ?? []).map((label) => rect(label as ElkNode)));
const beforeLabels = labelsOf(before);
const focusIds = new Set<string>();
for (let index = 0; index < beforeLabels.length; index++) {
  for (const other of beforeLabels.slice(index + 1)) {
    if (intersects(beforeLabels[index]!, other)) {
      focusIds.add(beforeLabels[index]!.id);
      focusIds.add(other.id);
    }
  }
}
const afterLabels = labelsOf(after);
const afterCollisions = afterLabels.some((label, index) =>
  afterLabels.slice(index + 1).some((other) => intersects(label, other)),
);
if (focusIds.size === 0 || afterCollisions) {
  throw new Error(
    `Expected a colliding baseline and collision-free result; baseline=${focusIds.size}, after=${afterCollisions}`,
  );
}
const proofLabels = [...beforeLabels, ...afterLabels].filter((label) => focusIds.has(label.id));
const proofX = Math.min(...proofLabels.map((label) => label.x)) - 60;
const proofY = Math.min(...proofLabels.map((label) => label.y)) - 120;
const width = Math.max(...proofLabels.map((label) => label.x + label.width)) - proofX + 60;
const height = Math.max(...proofLabels.map((label) => label.y + label.height)) - proofY + 60;
const escape = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const shortId = (id: string): string => {
  const invoke = id.match(/invoke-\$auto-invoke-([^-]+)-(done|error)-\d+$/);
  if (invoke) return `${invoke[2]}: ${invoke[1]}`;
  const transition = id.match(/^root\.([^-]+)-(.+)-\d+$/);
  if (transition) return `${transition[1]} → ${transition[2]}`;
  return id.split(".").at(-1) ?? id;
};

function render(graph: ElkNode, title: string): string {
  const nodes = (graph.children ?? []).map(rect);
  const labels = (graph.edges ?? []).flatMap((edge) =>
    (edge.labels ?? [])
      .map((label) => ({ ...rect(label as ElkNode), edge }))
      .filter((label) => focusIds.has(label.id)),
  );
  const collisions = new Set<string>();
  for (let index = 0; index < labels.length; index++) {
    for (const other of labels.slice(index + 1)) {
      if (intersects(labels[index]!, other)) {
        collisions.add(labels[index]!.id);
        collisions.add(other.id);
      }
    }
  }
  const routes = (graph.edges ?? [])
    .filter((edge) => focusIds.has(String(edge.id)))
    .flatMap((edge: ElkEdge) => edge.sections ?? [])
    .map((section) => {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      return `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"/>`;
    })
    .join("");
  const nodeMarkup = nodes
    .map(
      (node) =>
        `<g><rect class="state" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="18"/><text class="state-title" x="${node.x + 18}" y="${node.y + 34}">${escape(shortId(node.id))}</text></g>`,
    )
    .join("");
  const labelMarkup = labels
    .map((label) => {
      const collided = collisions.has(label.id);
      return `<g><rect class="label${collided ? " collision" : ""}" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="14"/><text class="label-title" x="${label.x + 16}" y="${label.y + 34}">${escape(shortId(label.id))}</text>${collided ? `<text class="collision-note" x="${label.x + 16}" y="${label.y + label.height - 18}">OVERLAP</text>` : ""}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${proofX} ${proofY} ${width} ${height}"><style>
    svg{background:#0c1018;font-family:ui-sans-serif,system-ui,sans-serif} .route{fill:none;stroke:#8294b1;stroke-width:7;stroke-linejoin:round;stroke-linecap:round}.state{fill:#202838;stroke:#71809a;stroke-width:3}.state-title{fill:#eef3fb;font-size:23px;font-weight:700}.label{fill:#153440;stroke:#42c7b7;stroke-width:4}.label.collision{fill:#612532;stroke:#ff5668;stroke-width:7}.label-title{fill:#f8fbff;font-size:22px;font-weight:700}.collision-note{fill:#ffb4bc;font-size:18px;font-weight:800;letter-spacing:2px}.heading{fill:#f8fbff;font-size:38px;font-weight:800}.summary{fill:${collisions.size ? "#ff7b8a" : "#66e3c4"};font-size:26px;font-weight:700}
  </style><rect x="${proofX}" y="${proofY}" width="${width}" height="${height}" fill="#0c1018"/><text class="heading" x="${proofX + 20}" y="${proofY + 42}">${escape(title)}</text><text class="summary" x="${proofX + 20}" y="${proofY + 78}">${collisions.size ? `${collisions.size} overlapping transition labels` : "0 overlapping transition labels"}</text><g class="route">${routes}</g>${nodeMarkup}${labelMarkup}</svg>`;
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(`${outputDir}/before.svg`, render(before, "Before — Layout 0.1.1")),
  writeFile(`${outputDir}/after.svg`, render(after, "After — collision-safe lanes")),
]);
