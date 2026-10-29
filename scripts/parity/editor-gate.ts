// Score what the Stately editor draws for two layout builds, row by row.
// Usage: tsx scripts/parity/editor-gate.ts <output.json> <baseline.json.gz> <candidate.json.gz>
// Inputs come from the viz harness (packages/editor/scripts/layout-gate): node
// bounds and label bounds from the layout, edge polylines from the editor's router.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { measureQuality } from "../heuristic-quality.mjs";
import { HARD, SOFT } from "./quality-gate";

type Rect = [x: number, y: number, width: number, height: number];
interface Row {
  source: string;
  machine: string;
  direction: string;
  canvas: string | null;
  layoutErrors: unknown[];
  error?: string;
  nodes?: Array<{ id: string; parentId?: string; rect: Rect }>;
  edges?: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    branchOf?: string;
    targetless?: boolean;
    label?: Rect;
    segments: Array<Array<[number, number]>>;
  }>;
}
type Metrics = Record<string, number>;
type Status = "WIN" | "TIE" | "LOSS" | "ERROR";

/** Routes through a compound state that holds neither endpoint read as cutting through siblings. */
export const EDITOR_HARD = [...HARD, "groupHits"] as const;
const TOLERANT = new Set(["edgeOverlapLength", "routeLength", "area"]);
const TOLERANCE = 0.02;
const EPS = 1e-6;
/**
 * The editor attaches routes at whole pixels while sizes are fractional, so a
 * route can graze a box by a fraction of a pixel. Hit tests ignore 1px.
 */
const GRAZE = 1;
const inset = ([x, y, w, h]: Rect): Rect =>
  w > 2 * GRAZE && h > 2 * GRAZE
    ? [x + GRAZE, y + GRAZE, w - 2 * GRAZE, h - 2 * GRAZE]
    : [x, y, w, h];

const key = (row: Row) => `${row.source}/${row.machine}|${row.direction}|${row.canvas}`;
/** The statechart corpus split: sha256 of `<source>/<machine>`, first byte even → corpus. */
export const split = (row: Pick<Row, "source" | "machine">) =>
  createHash("sha256").update(`${row.source}/${row.machine}`).digest()[0]! % 2 === 0
    ? "corpus"
    : "holdout";

const inside = (point: [number, number], [x, y, w, h]: Rect) =>
  point[0] > x + EPS && point[0] < x + w - EPS && point[1] > y + EPS && point[1] < y + h - EPS;

/** Whether a segment runs through the open interior of a rectangle. */
function crosses(a: [number, number], b: [number, number], rect: Rect) {
  const [x, y, w, h] = rect;
  let enter = 0,
    exit = 1;
  for (const [axis, lo, hi] of [
    [0, x, x + w],
    [1, y, y + h],
  ] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) {
      if (a[axis] <= lo + EPS || a[axis] >= hi - EPS) return false;
      continue;
    }
    const s = (lo - a[axis]) / delta,
      t = (hi - a[axis]) / delta;
    enter = Math.max(enter, Math.min(s, t));
    exit = Math.min(exit, Math.max(s, t));
  }
  return exit - enter > EPS || inside(a, rect) || inside(b, rect);
}

/** Shared quality metrics on the editor's geometry, plus compound pass-throughs. */
export function scoreRow(row: Row): Metrics {
  const nodes = row.nodes!,
    edges = row.edges!;
  const byId = new Map(nodes.map((node) => [node.id, { ...node, rect: inset(node.rect) }]));
  // measureQuality nests coordinates under parents; the editor reports world bounds.
  const layout = {
    nodes: [...byId.values()].map(({ id, parentId, rect: [x, y, width, height] }) => {
      const parent = parentId ? byId.get(parentId) : undefined;
      return {
        id,
        ...(parent ? { parentId } : {}),
        x: x - (parent?.rect[0] ?? 0),
        y: y - (parent?.rect[1] ?? 0),
        width,
        height,
      };
    }),
    edges: edges.map(({ id, label }) =>
      label
        ? (([x, y, width, height]) => ({ id, x, y, width, height }))(inset(label))
        : { id, x: 0, y: 0, width: 0, height: 0 },
    ),
    routes: new Map(
      edges.map((edge) => [
        edge.id,
        {
          sections: edge.segments
            .filter((points) => points.length > 1)
            .map((points) => ({
              path: {
                start: { x: points[0]![0], y: points[0]![1] },
                segments: points.slice(1).map(([x, y]) => ({ kind: "line", to: { x, y } })),
              },
            })),
        },
      ]),
    ),
  };
  const input = {
    nodes: nodes.map(({ id }) => ({ id })),
    edges: edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
  };
  const metrics = measureQuality(layout, input) as Metrics;
  const parents = new Set(nodes.map((node) => node.parentId));
  const ancestors = (id: string) => {
    const out = new Set<string>();
    for (let at = byId.get(id); at; at = at.parentId ? byId.get(at.parentId) : undefined)
      out.add(at.id);
    return out;
  };
  let groupHits = 0;
  for (const edge of edges) {
    const allowed = new Set([...ancestors(edge.sourceId), ...ancestors(edge.targetId)]);
    for (const group of byId.values())
      if (
        parents.has(group.id) &&
        !allowed.has(group.id) &&
        edge.segments.some((points) =>
          points.slice(1).some((point, i) => crosses(points[i]!, point, group.rect)),
        )
      )
        groupHits++;
  }
  return { ...metrics, edgeLabelHits: labelHits(edges), groupHits };
}

/**
 * The editor stacks the labels of parallel transitions, and of a guarded
 * branch chain, on one shared trunk, so a route through a label of its own
 * family is the intended drawing. Only hits on other families count.
 */
function labelHits(edges: NonNullable<Row["edges"]>) {
  const family = new Map<string, string>();
  const find = (id: string): string => {
    const parent = family.get(id) ?? id;
    return parent === id ? id : find(parent);
  };
  const join = (a: string, b: string) => family.set(find(a), find(b));
  const pairs = new Map<string, string>();
  for (const edge of edges) {
    const pair = `${edge.sourceId}\u0000${edge.targetId}`;
    if (pairs.has(pair)) join(edge.id, pairs.get(pair)!);
    else pairs.set(pair, edge.id);
    if (edge.branchOf && edges.some(({ id }) => id === edge.branchOf)) join(edge.id, edge.branchOf);
  }
  let hits = 0;
  for (const edge of edges)
    for (const other of edges)
      if (
        other.label &&
        find(other.id) !== find(edge.id) &&
        edge.segments.some((points) =>
          points.slice(1).some((point, i) => crosses(points[i]!, point, inset(other.label!))),
        )
      )
        hits++;
  return hits;
}

const differs = (metric: string, a: number, b: number) =>
  Math.abs(a - b) > (TOLERANT.has(metric) ? Math.max(TOLERANCE * Math.abs(b), 1e-6) : 0);

/**
 * The ELK gate's rule (hard-clean wins, then the first differing soft metric),
 * except that when both sides have hard violations, a side that is worse on
 * some hard metric and better on none loses. A canvas that already has a
 * defect must not get more of them unnoticed.
 */
export function compare(
  candidate: Metrics,
  baseline: Metrics,
): { status: Status; metric?: string } {
  const candidateClean = EDITOR_HARD.every((metric) => !candidate[metric]),
    baselineClean = EDITOR_HARD.every((metric) => !baseline[metric]);
  if (candidateClean !== baselineClean)
    return { status: candidateClean ? "WIN" : "LOSS", metric: "hard" };
  if (!candidateClean) {
    // Lengths change by fractions of a pixel without anything visible moving.
    const changed = (metric: string, sign: number) =>
      sign * (candidate[metric]! - baseline[metric]!) > (metric.endsWith("Length") ? 1 : 0);
    const worse = EDITOR_HARD.some((metric) => changed(metric, 1)),
      better = EDITOR_HARD.some((metric) => changed(metric, -1));
    if (worse !== better) return { status: better ? "WIN" : "LOSS", metric: "hard" };
  }
  for (const metric of SOFT)
    if (differs(metric, candidate[metric]!, baseline[metric]!))
      return { status: candidate[metric]! < baseline[metric]! ? "WIN" : "LOSS", metric };
  return { status: "TIE" };
}

/**
 * Sibling order as pairwise relations: one sibling precedes another along the
 * flow axis when it ends before the other starts; otherwise they share a layer
 * and are ordered across it. Changed relations are order drift.
 */
export function orderRelations(row: Row): Map<string, string> {
  const flow = row.direction === "RIGHT" || row.direction === "LEFT" ? 0 : 1,
    cross = 1 - flow;
  const groups = new Map<string, Array<{ id: string; rect: Rect }>>();
  for (const node of row.nodes ?? []) {
    const list = groups.get(node.parentId ?? "") ?? [];
    list.push(node);
    groups.set(node.parentId ?? "", list);
  }
  const relations = new Map<string, string>();
  for (const siblings of groups.values())
    for (const a of siblings)
      for (const b of siblings) {
        if (a.id >= b.id) continue;
        const aEnd = a.rect[flow] + a.rect[flow + 2],
          bEnd = b.rect[flow] + b.rect[flow + 2];
        relations.set(
          `${a.id}|${b.id}`,
          aEnd <= b.rect[flow] + EPS
            ? "before"
            : bEnd <= a.rect[flow] + EPS
              ? "after"
              : a.rect[cross] + a.rect[cross + 2] / 2 < b.rect[cross] + b.rect[cross + 2] / 2
                ? "left"
                : "right",
        );
      }
  return relations;
}

const read = (file: string) =>
  JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString()) as {
    layoutSource: string;
    rows: Row[];
  };
const hard = (metrics: Metrics) =>
  Object.fromEntries(
    EDITOR_HARD.filter((metric) => metrics[metric]! > 0).map((metric) => [
      metric,
      metrics[metric]!,
    ]),
  );
/** Rows the editor shows something to judge on: a canvas with at least two states. */
const scorable = (row: Row) => !row.error && (row.nodes?.length ?? 0) > 1;

function summarize(results: Array<Record<string, any>>) {
  const count = (status: Status) => results.filter((row) => row.status === status).length;
  const scored = results.filter((row) => row.baseline && row.candidate);
  const total = (side: "baseline" | "candidate", metric: string) =>
    scored.reduce((sum, row) => sum + row[side][metric], 0);
  return {
    cases: results.length,
    WIN: count("WIN"),
    TIE: count("TIE"),
    LOSS: count("LOSS"),
    ERROR: count("ERROR"),
    hardCases: {
      baseline: scored.filter((row) => Object.keys(row.baselineHard).length).length,
      candidate: scored.filter((row) => Object.keys(row.candidateHard).length).length,
    },
    newHardCases: scored.filter(
      (row) => Object.keys(row.candidateHard).length && !Object.keys(row.baselineHard).length,
    ).length,
    fixedHardCases: scored.filter(
      (row) => !Object.keys(row.candidateHard).length && Object.keys(row.baselineHard).length,
    ).length,
    driftCases: results.filter((row) => row.drift > 0).length,
    totals: Object.fromEntries(
      [...EDITOR_HARD, ...SOFT].map((metric) => [
        metric,
        { baseline: total("baseline", metric), candidate: total("candidate", metric) },
      ]),
    ),
    decidedBy: Object.fromEntries(
      ["hard", ...SOFT].map((metric) => [
        metric,
        {
          win: results.filter((row) => row.status === "WIN" && row.metric === metric).length,
          loss: results.filter((row) => row.status === "LOSS" && row.metric === metric).length,
        },
      ]),
    ),
  };
}

function main([output, baselineFile, candidateFile]: string[]) {
  if (!output || !baselineFile || !candidateFile)
    throw new Error("Pass an output path, the baseline render and the candidate render");
  const baseline = read(baselineFile),
    candidate = read(candidateFile);
  const candidateRows = new Map(candidate.rows.map((row) => [key(row), row]));
  const results = [];
  for (const before of baseline.rows) {
    const after = candidateRows.get(key(before));
    if (!scorable(before) && (!after || !scorable(after))) continue;
    const row = {
      key: key(before),
      split: split(before),
      source: before.source,
      machine: before.machine,
      direction: before.direction,
      canvas: before.canvas,
    };
    if (!after || !scorable(before) || !scorable(after)) {
      results.push({ ...row, status: "ERROR", error: after?.error ?? before.error ?? "missing" });
      continue;
    }
    const b = scoreRow(before),
      c = scoreRow(after);
    const beforeOrder = orderRelations(before),
      afterOrder = orderRelations(after);
    let drift = 0;
    for (const [pair, relation] of beforeOrder) if (afterOrder.get(pair) !== relation) drift++;
    results.push({
      ...row,
      ...compare(c, b),
      drift,
      baselineHard: hard(b),
      candidateHard: hard(c),
      baseline: b,
      candidate: c,
    });
  }
  const corpus = results.filter((row) => row.split === "corpus"),
    holdout = results.filter((row) => row.split === "holdout");
  const report = {
    baseline: baseline.layoutSource,
    candidate: candidate.layoutSource,
    tolerance: TOLERANCE,
    hard: EDITOR_HARD,
    order: SOFT,
    corpus: summarize(corpus),
    holdout: summarize(holdout),
    // Holdout rows are never diagnosed; only their aggregate is reported.
    rows: corpus,
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 1) + "\n");
  for (const [name, summary] of [
    ["corpus", report.corpus],
    ["holdout", report.holdout],
  ] as const) {
    const { totals, decidedBy: _, ...headline } = summary;
    console.log(name, JSON.stringify(headline));
    for (const [metric, value] of Object.entries(totals))
      if (value.baseline || value.candidate)
        console.log(
          `  ${metric.padEnd(22)} ${Math.round(value.baseline)} → ${Math.round(value.candidate)}`,
        );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]))
  main(process.argv.slice(2));
