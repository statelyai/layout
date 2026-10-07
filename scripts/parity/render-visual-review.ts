// Render native and real-ELK layouts side by side for a visual quality review.
// Usage: tsx scripts/parity/render-visual-review.ts <output.html> <seed> <report>...
import fs from "node:fs";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compare, HARD, SOFT, score } from "./quality-gate";
import { readReport } from "./read-report.mjs";

const [output, seedArgument, ...reports] = process.argv.slice(2);
if (!output || !seedArgument || !reports.length)
  throw new Error("Pass an output path, a sampling seed and retained reports");

const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");

/** One engine's ELK JSON result as an SVG drawing in absolute coordinates. */
function drawing(root: ElkNode): string {
  const frames = new Map<string, { x: number; y: number }>([[String(root.id), { x: 0, y: 0 }]]);
  const shapes: string[] = [],
    routes: string[] = [],
    labels: string[] = [];
  let maxX = Number(root.width ?? 0),
    maxY = Number(root.height ?? 0);
  const grow = (x: number, y: number) => {
    if (Number.isFinite(x)) maxX = Math.max(maxX, x);
    if (Number.isFinite(y)) maxY = Math.max(maxY, y);
  };
  const place = (parent: ElkNode, offset: { x: number; y: number }) => {
    for (const child of parent.children ?? []) {
      const x = offset.x + (child.x ?? 0),
        y = offset.y + (child.y ?? 0);
      frames.set(String(child.id), { x, y });
      const compound = Boolean(child.children?.length);
      grow(x + (child.width ?? 0), y + (child.height ?? 0));
      shapes.push(
        `<rect class="${compound ? "compound" : "node"}" x="${x}" y="${y}" width="${child.width ?? 0}" height="${child.height ?? 0}" rx="${compound ? 6 : 4}"/>`,
      );
      const text = child.labels?.[0]?.text ?? String(child.id).split(".").at(-1);
      shapes.push(
        `<text class="${compound ? "compound-name" : "node-name"}" x="${x + 6}" y="${y + 14}">${escape(text)}</text>`,
      );
      for (const port of child.ports ?? [])
        shapes.push(
          `<rect class="port" x="${x + (port.x ?? 0)}" y="${y + (port.y ?? 0)}" width="${Math.max(2, port.width ?? 0)}" height="${Math.max(2, port.height ?? 0)}"/>`,
        );
      place(child, { x, y });
    }
  };
  place(root, { x: 0, y: 0 });
  const collect = (parent: ElkNode) => {
    for (const edge of parent.edges ?? []) {
      const offset = frames.get(
        String((edge as { container?: string }).container ?? parent.id),
      ) ?? { x: 0, y: 0 };
      for (const section of edge.sections ?? []) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
          (point) => ({ x: point.x + offset.x, y: point.y + offset.y }),
        );
        for (const point of points) grow(point.x, point.y);
        routes.push(
          `<polyline class="route" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"/>`,
        );
        const end = points.at(-1)!,
          before = points.at(-2) ?? end;
        const angle = Math.atan2(end.y - before.y, end.x - before.x);
        const tip = (side: number) =>
          `${end.x - 6 * Math.cos(angle + side)},${end.y - 6 * Math.sin(angle + side)}`;
        routes.push(
          `<polygon class="arrow" points="${end.x},${end.y} ${tip(0.45)} ${tip(-0.45)}"/>`,
        );
      }
      for (const label of edge.labels ?? []) {
        if (!label.width || !label.height) continue;
        const x = (label.x ?? 0) + offset.x,
          y = (label.y ?? 0) + offset.y;
        grow(x + label.width, y + label.height);
        labels.push(
          `<rect class="label" x="${x}" y="${y}" width="${label.width}" height="${label.height}"/><text class="label-text" x="${x + 2}" y="${y + label.height - 3}">${escape(label.text ?? edge.id)}</text>`,
        );
      }
    }
    for (const child of parent.children ?? []) collect(child);
  };
  collect(root);
  const pad = 8;
  return `<svg viewBox="${-pad} ${-pad} ${maxX + 2 * pad} ${maxY + 2 * pad}" role="img">${shapes.join("")}${routes.join("")}${labels.join("")}</svg>`;
}

interface Case {
  title: string;
  subtitle: string;
  input: ElkNode;
  elk?: ElkNode;
  elkError?: string;
}

const metricRow = (native?: Record<string, number>, elk?: Record<string, number>) => {
  const hard = (metrics?: Record<string, number>) =>
    metrics ? HARD.filter((key) => metrics[key]! > 0) : [];
  const cell = (metric: string, value?: number, other?: number) => {
    if (value === undefined) return `<td>—</td>`;
    const rounded = metric === "edgeCrossings" || metric === "bends" ? value : Math.round(value);
    const better = other !== undefined && value < other - Math.max(1e-6, 0.02 * Math.abs(other));
    const worse = other !== undefined && value > other + Math.max(1e-6, 0.02 * Math.abs(other));
    return `<td class="${better ? "better" : worse ? "worse" : ""}">${rounded.toLocaleString("en-US")}</td>`;
  };
  const row = (name: string, a?: Record<string, number>, b?: Record<string, number>) =>
    `<tr><th scope="row">${name}</th><td>${
      hard(a).length ? `<span class="defect">${escape(hard(a).join(", "))}</span>` : "none"
    }</td>${SOFT.map((metric) => cell(metric, a?.[metric], b?.[metric])).join("")}</tr>`;
  return `<table><thead><tr><th></th><th>Defects</th><th>Crossings</th><th>Overlap</th><th>Bends</th><th>Length</th><th>Area</th></tr></thead><tbody>${row("Native", native, elk)}${row("ELK", elk, native)}</tbody></table>`;
};

async function render(item: Case, index: number): Promise<string> {
  const native = await new NativeELK().layout(structuredClone(item.input));
  let elk = item.elk,
    elkError = item.elkError;
  if (!elk && !elkError)
    try {
      elk = (await new OracleELK().layout(structuredClone(item.input) as never)) as ElkNode;
    } catch (error) {
      elkError = String(error);
    }
  const nativeScore = score(native, item.input);
  const elkScore = elk ? score(elk, item.input) : undefined;
  const verdict = elkScore ? compare(nativeScore, elkScore) : { status: "ORACLE_ERROR" };
  const pill = verdict.status.toLowerCase().replace("_", "-");
  return `<article class="case" id="case-${index + 1}">
  <header><div><h3>${escape(item.title)}</h3><p>${escape(item.subtitle)}</p></div>
  <span class="pill ${pill}">${verdict.status.replace("_", " ")}${"metric" in verdict && verdict.metric ? ` · ${verdict.metric}` : ""}</span></header>
  <div class="pair">
    <figure><figcaption>Native</figcaption><div class="canvas">${drawing(native)}</div></figure>
    <figure><figcaption>ELK 0.11.1</figcaption><div class="canvas">${
      elk ? drawing(elk) : `<p class="error">${escape(elkError?.slice(0, 160))}</p>`
    }</div></figure>
  </div>
  <div class="metrics">${metricRow(nativeScore, elkScore)}</div>
</article>`;
}

// Deterministic sample across the retained corpora, skipping oracle errors.
let state = Number(seedArgument) >>> 0 || 1;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 2 ** 32;
};
const pool = reports.flatMap((report) =>
  (
    readReport(report).rows as Array<{
      input: ElkNode;
      elk: { graph?: ElkNode; error?: string };
      seed?: number;
      direction?: string;
      family?: string;
    }>
  )
    .filter((row) => row.elk.graph)
    .map((row) => ({ report, row })),
);
const sample: Case[] = [];
const taken = new Set<number>();
while (sample.length < 20 && taken.size < pool.length) {
  const pick = Math.floor(random() * pool.length);
  if (taken.has(pick)) continue;
  taken.add(pick);
  const { report, row } = pool[pick]!;
  const corpus = report
    .split("/")
    .pop()!
    .replace(/(\.json)?(\.gz)?$/, "");
  sample.push({
    title: `${corpus} · seed ${row.seed} ${row.direction}`,
    subtitle: row.family ? `${row.family} family` : "flat family",
    input: row.input,
    elk: row.elk.graph,
  });
}

// Stately statechart fixtures, laid out by both engines from the same ELK input.
const nested = (fixture: {
  id: string;
  nodes: Array<{
    id: string;
    parentId?: string | null;
    width?: number;
    height?: number;
    label?: string;
  }>;
  edges: Array<{ id: string; sourceId: string; targetId: string; label?: string }>;
}): ElkNode => {
  const nodes = new Map<string, ElkNode>(
    fixture.nodes.map((node) => [
      node.id,
      {
        id: node.id,
        width: node.width ?? 120,
        height: node.height ?? 48,
        labels: [{ text: node.label ?? node.id.split(".").at(-1) }],
      },
    ]),
  );
  const root: ElkNode = {
    id: fixture.id,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=48,left=24,bottom=24,right=24]",
    },
    children: [],
    edges: [],
  };
  for (const node of fixture.nodes) {
    const parent = node.parentId ? nodes.get(node.parentId)! : root;
    (parent.children ??= []).push(nodes.get(node.id)!);
  }
  for (const node of nodes.values())
    if (node.children?.length)
      node.layoutOptions = { "elk.padding": "[top=48,left=24,bottom=24,right=24]" };
  root.edges = fixture.edges.map((edge) => ({
    id: edge.id,
    sources: [edge.sourceId],
    targets: [edge.targetId],
    ...(edge.label
      ? { labels: [{ text: edge.label, width: edge.label.length * 7, height: 14 }] }
      : {}),
  }));
  return root;
};
const fixtures: Case[] = [];
for (const name of [
  "babyfood-statechart",
  "email-drafter-viz",
  "viz-feedback-form",
  "viz-two-state-cycle",
  "cross-hierarchy-viz",
  "editor-modes-native",
  "espresso-native",
]) {
  const data = JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, "utf8"));
  fixtures.push({
    title: name,
    subtitle: Array.isArray(data.nodes)
      ? "Stately graph, converted to ELK JSON"
      : "Stately Studio ELK input",
    input: Array.isArray(data.nodes) ? nested(data) : data,
  });
}

const sampled = await Promise.all(sample.map(render));
const statecharts = await Promise.all(fixtures.map((item, index) => render(item, index + 20)));
const counts = (html: string[]) =>
  ["win", "tie", "loss"].map(
    (status) => html.filter((card) => card.includes(`class="pill ${status}"`)).length,
  );
const [win, tie, loss] = counts(sampled);
const template = fs.readFileSync(new URL("./visual-review.template.html", import.meta.url), "utf8");
fs.writeFileSync(
  output,
  template
    .replace("{{summary}}", `${win} wins · ${tie} ties · ${loss} losses in the random sample`)
    .replace("{{seed}}", escape(seedArgument))
    .replace("{{sample}}", sampled.join("\n"))
    .replace("{{statecharts}}", statecharts.join("\n")),
);
console.log(JSON.stringify({ output, win, tie, loss, fixtures: fixtures.length }));
