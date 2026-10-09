// Score native layouts against frozen real-ELK output with the shared quality metrics.
// Usage: tsx scripts/parity/quality-gate.ts <output.json> <report>... [--jobs N]
// Each report row needs `input` and `elk` ({ graph } or { error }); native is replayed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { measureQuality } from "../heuristic-quality.mjs";
import { readReport } from "./read-report.mjs";

export const HARD = [
  "missingNodes",
  "missingRoutes",
  "nonFinite",
  "diagonals",
  "nodeOverlaps",
  "nodeHits",
  "labelOverlaps",
  "labelNodeOverlaps",
  "edgeLabelHits",
  "selfRetraceLength",
  "opposingOverlapLength",
] as const;
/** Compared in order; the first metric that differs decides the seed. */
export const SOFT = ["edgeCrossings", "edgeOverlapLength", "bends", "routeLength", "area"] as const;
const TOLERANT = new Set(["edgeOverlapLength", "routeLength", "area"]);
const TOLERANCE = 0.02;
type Metrics = Record<string, number>;
type Status = "WIN" | "TIE" | "LOSS" | "ORACLE_ERROR" | "NATIVE_ERROR";

interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
}

/** The ELK input's nodes and edges, with port endpoints resolved to their nodes. */
export function qualityInput(root: ElkNode): { nodes: { id: string }[]; edges: Edge[] } {
  const nodes: { id: string }[] = [],
    edges: Edge[] = [],
    owner = new Map<string, string>();
  const visit = (parent: ElkNode) => {
    for (const child of parent.children ?? []) {
      nodes.push({ id: String(child.id) });
      owner.set(String(child.id), String(child.id));
      for (const port of child.ports ?? []) owner.set(String(port.id), String(child.id));
      visit(child);
    }
  };
  visit(root);
  for (const port of root.ports ?? []) owner.set(String(port.id), String(root.id));
  const collect = (parent: ElkNode) => {
    for (const edge of parent.edges ?? []) {
      const end = (ids?: readonly unknown[]) => owner.get(String(ids?.[0])) ?? String(ids?.[0]);
      edges.push({ id: String(edge.id), sourceId: end(edge.sources), targetId: end(edge.targets) });
    }
    for (const child of parent.children ?? []) collect(child);
  };
  collect(root);
  return { nodes, edges };
}

/** Convert an ELK JSON result (either engine) to the shared metric layout. */
export function qualityLayout(root: ElkNode) {
  const nodes: Array<
    { id: string; parentId?: string } & Record<"x" | "y" | "width" | "height", number>
  > = [];
  const edges: Array<{ id: string } & Record<"x" | "y" | "width" | "height", number>> = [];
  const routes = new Map<string, unknown>();
  const rootId = String(root.id);
  const frames = new Map([[rootId, { x: 0, y: 0 }]]);
  const visit = (parent: ElkNode, offset: { x: number; y: number }, parentId?: string) => {
    for (const child of parent.children ?? []) {
      const id = String(child.id);
      nodes.push({
        id,
        ...(parentId ? { parentId } : {}),
        x: child.x as number,
        y: child.y as number,
        width: child.width as number,
        height: child.height as number,
      });
      const world = { x: offset.x + (child.x ?? NaN), y: offset.y + (child.y ?? NaN) };
      frames.set(id, world);
      visit(child, world, id);
    }
  };
  visit(root, { x: 0, y: 0 });
  const collect = (parent: ElkNode) => {
    for (const edge of parent.edges ?? []) {
      const id = String(edge.id);
      const container = String((edge as { container?: string }).container ?? parent.id);
      const offset = frames.get(container) ?? { x: NaN, y: NaN };
      const at = (point: { x: number; y: number }) => ({
        x: point.x + offset.x,
        y: point.y + offset.y,
      });
      routes.set(id, {
        sections: (edge.sections ?? []).map((section) => {
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
            at,
          );
          return {
            path: {
              start: points[0],
              segments: points.slice(1).map((to) => ({ kind: "line", to })),
            },
          };
        }),
      });
      const labels = (edge.labels ?? []).filter((label) => label.width && label.height);
      if (!labels.length) edges.push({ id, x: 0, y: 0, width: 0, height: 0 });
      for (const label of labels)
        edges.push({
          id,
          ...at({ x: label.x as number, y: label.y as number }),
          width: label.width as number,
          height: label.height as number,
        });
    }
    for (const child of parent.children ?? []) collect(child);
  };
  collect(root);
  return { layout: { nodes, edges }, routes };
}

export function score(graph: ElkNode, input: ElkNode): Metrics {
  const { layout, routes } = qualityLayout(graph);
  return measureQuality({ ...layout, routes }, qualityInput(input)) as Metrics;
}

const differs = (metric: string, native: number, elk: number) =>
  Math.abs(native - elk) > (TOLERANT.has(metric) ? Math.max(TOLERANCE * Math.abs(elk), 1e-6) : 0);

/**
 * A layout without hard violations beats one with them. Otherwise, WIN or TIE
 * when native is no worse at the first soft metric where the engines differ.
 */
export function compare(native: Metrics, elk: Metrics): { status: Status; metric?: string } {
  const nativeClean = HARD.every((key) => !native[key]),
    elkClean = HARD.every((key) => !elk[key]);
  if (nativeClean !== elkClean) return { status: nativeClean ? "WIN" : "LOSS", metric: "hard" };
  for (const metric of SOFT)
    if (differs(metric, native[metric]!, elk[metric]!))
      return { status: native[metric]! < elk[metric]! ? "WIN" : "LOSS", metric };
  return { status: "TIE" };
}
const hard = (metrics: Metrics) =>
  Object.fromEntries(HARD.filter((key) => metrics[key]! > 0).map((key) => [key, metrics[key]!]));

async function worker(report: string, start: number, end: number, output: string) {
  const rows = readReport(report).rows as Array<{
    input: ElkNode;
    elk: { graph?: ElkNode; error?: string };
    seed?: number;
    direction?: string;
    family?: string;
  }>;
  const results = [];
  for (let index = start; index < Math.min(end, rows.length); index++) {
    const row = rows[index]!;
    let nativeGraph: ElkNode | undefined, nativeError: string | undefined;
    const started = performance.now();
    try {
      nativeGraph = await new NativeELK().layout(structuredClone(row.input));
    } catch (error) {
      nativeError = String(error);
    }
    const ms = performance.now() - started;
    const native = nativeGraph ? score(nativeGraph, row.input) : undefined;
    const elk = row.elk.graph ? score(row.elk.graph, row.input) : undefined;
    const verdict = !native
      ? { status: "NATIVE_ERROR" as Status }
      : !elk
        ? { status: "ORACLE_ERROR" as Status }
        : compare(native, elk);
    results.push({
      report,
      index,
      family: row.family,
      seed: row.seed,
      direction: row.direction,
      ...verdict,
      ...(nativeError ? { nativeError } : {}),
      ...(row.elk.error ? { elkError: row.elk.error.slice(0, 200) } : {}),
      nativeHard: native ? hard(native) : {},
      elkHard: elk ? hard(elk) : {},
      native,
      elk,
      ms: Math.round(ms),
    });
  }
  fs.writeFileSync(output, JSON.stringify(results));
}

function summarize(results: Array<Record<string, any>>) {
  const count = (status: Status) => results.filter((row) => row.status === status).length;
  const both = results.filter((row) => row.native && row.elk);
  const sum = (rows: typeof both) =>
    Object.fromEntries(
      SOFT.map((metric) => {
        const native = rows.reduce((total, row) => total + row.native[metric], 0),
          elk = rows.reduce((total, row) => total + row.elk[metric], 0);
        return [metric, { native, elk, ok: native <= elk }];
      }),
    );
  const totals = sum(both);
  // A defective ELK layout can score well on soft metrics (edges collapsed
  // onto one line cross nothing), so soft totals are also given over the
  // rows where ELK has no hard violations.
  const elkCleanRows = both.filter((row) => !Object.keys(row.elkHard).length);
  const elkCleanTotals = sum(elkCleanRows);
  const hardTotals = Object.fromEntries(
    HARD.map((metric) => [
      metric,
      {
        native: results.reduce((sum, row) => sum + (row.nativeHard[metric] ?? 0), 0),
        elk: results.reduce((sum, row) => sum + (row.elkHard[metric] ?? 0), 0),
      },
    ]),
  );
  const decidedBy = Object.fromEntries(
    ["hard", ...SOFT].map((metric) => [
      metric,
      {
        win: results.filter((row) => row.status === "WIN" && row.metric === metric).length,
        loss: results.filter((row) => row.status === "LOSS" && row.metric === metric).length,
      },
    ]),
  );
  return {
    cases: results.length,
    WIN: count("WIN"),
    TIE: count("TIE"),
    LOSS: count("LOSS"),
    ORACLE_ERROR: count("ORACLE_ERROR"),
    NATIVE_ERROR: count("NATIVE_ERROR"),
    hardViolationCases: results.filter((row) => Object.keys(row.nativeHard).length).length,
    elkHardViolationCases: results.filter((row) => Object.keys(row.elkHard).length).length,
    hardTotals,
    totals,
    totalsOk: Object.values(totals).every((total) => total.ok),
    elkCleanCases: elkCleanRows.length,
    elkCleanTotals,
    decidedBy,
  };
}

async function main(argv: string[]) {
  const jobsAt = argv.indexOf("--jobs");
  const jobs = jobsAt >= 0 ? Number(argv[jobsAt + 1]) : Math.max(1, os.cpus().length - 2);
  const [output, ...reports] = argv.filter((_, i) => i !== jobsAt && i !== jobsAt + 1);
  if (!output || !reports.length) throw new Error("Pass an output path and retained reports");
  const started = performance.now();
  const chunk = 40;
  const tasks = reports.flatMap((report) => {
    const length = readReport(report).rows.length;
    return Array.from({ length: Math.ceil(length / chunk) }, (_, i) => ({
      report,
      start: i * chunk,
      end: (i + 1) * chunk,
      part: `${output}.part-${reports.indexOf(report)}-${i}.json`,
    }));
  });
  const script = fileURLToPath(import.meta.url);
  let next = 0;
  const run = async (): Promise<void> => {
    const task = tasks[next++];
    if (!task) return;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "pnpm",
        [
          "exec",
          "tsx",
          script,
          "--worker",
          task.report,
          String(task.start),
          String(task.end),
          task.part,
        ],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Worker failed: ${task.report}@${task.start}`)),
      );
    });
    return run();
  };
  await Promise.all(Array.from({ length: jobs }, run));
  const results = tasks.flatMap((task) => {
    const rows = JSON.parse(fs.readFileSync(task.part, "utf8"));
    fs.rmSync(task.part);
    return rows;
  });
  const byReport = Object.fromEntries(
    reports.map((report) => [report, summarize(results.filter((row) => row.report === report))]),
  );
  const total = summarize(results);
  const elapsedSeconds = Math.round((performance.now() - started) / 1000);
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        oracle: "elkjs@0.11.1",
        tolerance: TOLERANCE,
        order: SOFT,
        hard: HARD,
        elapsedSeconds,
        total,
        byReport,
        rows: results.map(({ native, elk, ...row }) => ({ ...row, native, elk })),
      },
      null,
      1,
    ) + "\n",
  );
  const { totals, elkCleanTotals, hardTotals: _, decidedBy: __, ...headline } = total;
  console.log(JSON.stringify({ ...headline, elapsedSeconds }));
  const column = (value: { native: number; elk: number; ok: boolean }) =>
    `${Math.round(value.native)} vs ELK ${Math.round(value.elk)} ${value.ok ? "ok" : "OVER"}`;
  console.log("".padEnd(18), "all rows".padEnd(36), `ELK-clean rows (${total.elkCleanCases})`);
  for (const [metric, value] of Object.entries(totals))
    console.log(metric.padEnd(18), column(value).padEnd(36), column(elkCleanTotals[metric]!));
}

const argv = process.argv.slice(2);
if (argv[0] === "--worker") await worker(argv[1]!, Number(argv[2]), Number(argv[3]), argv[4]!);
else if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]))
  await main(argv);
