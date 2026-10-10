// Classify each retained case by its earliest phase divergence from real ELK.
// Usage: tsx scripts/parity/compare-phases.ts <output.json> <report.json>...
import fs from "node:fs";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { setLayeredTraceObserver, type LayeredTraceEvent } from "../../src/internal/layered-trace";
import { compoundGeometry, geometryDifferences } from "./compound-corpus";
import { readReport } from "./read-report.mjs";
import { traceElkPhases } from "./trace-phase-worker.mjs";

type Layers = readonly (readonly string[])[];
type PortList = { name?: string; outgoing: readonly string[]; incoming: readonly string[] }[];
interface ElkScope {
  scope: number;
  edgeIds: string[];
  reversed: string[];
  layering?: Layers;
  initialOrder?: Layers;
  crossingOrder?: Layers;
}

const [output, ...reports] = process.argv.slice(2);
if (!output || !reports.length) throw new Error("Pass an output path and retained reports");

const PHASES = [
  "unmatchedScope",
  "cycleBreaking",
  "layering",
  "initialOrder",
  "crossingOrder",
  "placement",
  "routing",
  "exact",
] as const;
const isReal = (token: string) =>
  !token.includes(":") && token !== "NS" && !/^[A-Z_]+$/.test(token);
const originalEdge = (id: string) => id.replace(/^(__native_hierarchy_edge_[^_]+_)+/, "");
/** Boundary dummy id -> its edge, from the parent's port lists; reset per row. */
let boundaryEdges = new Map<string, string>();
/** Native ids use the same tokens as the ELK observer. */
const nativeToken = (id: string) => {
  if (!id.startsWith("__")) return id;
  if (id.startsWith("__layout_dummy:north-south:")) return "NS";
  if (/^__native_hierarchy_(?!edge_)/.test(id)) {
    // Split boundary dummies (`:flow:<n>`) keep their port's base id.
    const edge = boundaryEdges.get(id.split(":")[0]!);
    return edge === undefined ? "EXTERNAL_PORT" : `X:${edge}`;
  }
  const edge = originalEdge(
    id
      .replace(/^__layout_dummy:(label:|inverted:)?/, "")
      .split("::")[0]!
      .replace(/:(source|target|\d+)(:\d+)?$/, "")
      .replace(/:+$/, ""),
  );
  return id.startsWith("__layout_dummy:") ? `L:${edge}` : "?";
};
const realOrder = (layers: Layers) => layers.map((layer) => layer.filter(isReal));
const multisets = (layers: Layers) => JSON.stringify(layers.map((layer) => [...layer].sort()));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Compare orders on real nodes always, and on every token when both sides name them alike. */
const orderDiffers = (native: Layers, elk: Layers) =>
  !same(realOrder(native), realOrder(elk)) ||
  (multisets(native) === multisets(elk) && !same(native, elk));
const partition = (layers: Layers) =>
  JSON.stringify(
    layers.map((layer) => layer.filter(isReal).sort()).filter((layer) => layer.length > 0),
  );

function classifyScope(
  native: { initial?: Layers; crossing: Extract<LayeredTraceEvent, { kind: "crossing-order" }> },
  elk: ElkScope,
): (typeof PHASES)[number] {
  const common = new Set(native.crossing.edgeIds.filter((id) => elk.edgeIds.includes(id)));
  const nativeReversed = native.crossing.reversedEdgeIds.filter((id) => common.has(id)).sort();
  const elkReversed = elk.reversed.filter((id) => common.has(id)).sort();
  if (!same(nativeReversed, elkReversed)) return "cycleBreaking";
  const nativeLayers: string[][] = [];
  for (const [id, layer] of native.crossing.layerByNodeId)
    if (!id.startsWith("__")) (nativeLayers[layer] ??= []).push(id);
  if (elk.layering && partition(nativeLayers.map((l) => l ?? [])) !== partition(elk.layering))
    return "layering";
  if (native.initial && elk.initialOrder && orderDiffers(native.initial, elk.initialOrder))
    return "initialOrder";
  const crossing = native.crossing.layers.map((layer) => layer.map(nativeToken));
  if (elk.crossingOrder && orderDiffers(crossing, elk.crossingOrder)) return "crossingOrder";
  return "placement";
}

const engine = new NativeELK();
const results = [];
const tally: Record<string, Record<string, number>> = {};
const started = Date.now();
for (const report of reports) {
  const rows = readReport(report).rows as Array<{
    input: ElkNode;
    elk?: { error?: string };
    seed?: number;
    direction?: string;
  }>;
  const counts: Record<string, number> = {};
  for (const [index, row] of rows.entries()) {
    if (row.elk?.error) {
      counts.oracleError = (counts.oracleError ?? 0) + 1;
      continue;
    }
    const events: LayeredTraceEvent[] = [];
    const previous = setLayeredTraceObserver((event) =>
      events.push(JSON.parse(JSON.stringify(event, (_, v) => (v instanceof Map ? [...v] : v)))),
    );
    let native: ElkNode | undefined;
    try {
      native = await engine.layout(structuredClone(row.input));
    } catch {
      native = undefined;
    } finally {
      setLayeredTraceObserver(previous);
    }
    const elk = await traceElkPhases(row.input);
    boundaryEdges = new Map();
    for (const event of events)
      if (event.kind === "port-lists")
        for (const [, ports] of event.ports as unknown as [string, PortList][])
          for (const port of ports) {
            const [edge] = [...port.outgoing, ...port.incoming];
            if (port.name?.endsWith(":parent") && edge !== undefined)
              boundaryEdges.set(port.name.slice(0, -":parent".length), originalEdge(edge));
          }
    let phase: (typeof PHASES)[number] | "nativeError";
    const scopes: { scope: string; phase: string }[] = [];
    if (!native) phase = "nativeError";
    else {
      const differences = geometryDifferences(
        compoundGeometry(native),
        compoundGeometry(elk.output),
      );
      phase = "exact";
      if (differences.length) {
        const initial = new Map<string, Layers>();
        for (const event of events)
          if (event.kind === "initial-order" && !initial.has(event.scope))
            initial.set(
              event.scope,
              event.layers.map((l) => l.map(nativeToken)),
            );
        let earliest = PHASES.indexOf("placement");
        for (const event of events) {
          if (event.kind !== "crossing-order") continue;
          const crossing = {
            ...event,
            layerByNodeId: new Map(event.layerByNodeId as unknown as [string, number][]),
          };
          const ids = (list: string[]) => JSON.stringify([...new Set(list)].sort());
          const real = ids([...crossing.layerByNodeId.keys()].filter((id) => !id.startsWith("__")));
          const match = elk.scopes.find(
            (scope) => scope.layering && ids(scope.layering.flat().filter(isReal)) === real,
          );
          const scopePhase = match
            ? classifyScope({ initial: initial.get(event.scope), crossing }, match)
            : "unmatchedScope";
          scopes.push({ scope: event.scope, phase: scopePhase });
          earliest = Math.min(earliest, PHASES.indexOf(scopePhase));
        }
        phase = PHASES[earliest]!;
        // Matching orders: node geometry separates placement from routing.
        if (
          phase === "placement" &&
          differences.every((d) => /sections|junction|labels|bendPoints/.test(d.path))
        )
          phase = "routing";
      }
    }
    counts[phase] = (counts[phase] ?? 0) + 1;
    results.push({ report, index, seed: row.seed, direction: row.direction, phase, scopes });
  }
  tally[report] = counts;
  console.log(report, counts);
}
const total: Record<string, number> = {};
for (const counts of Object.values(tally))
  for (const [phase, count] of Object.entries(counts)) total[phase] = (total[phase] ?? 0) + count;
fs.writeFileSync(
  output,
  JSON.stringify(
    { oracle: "elkjs@0.11.1", elapsedMs: Date.now() - started, total, tally, results },
    null,
    1,
  ) + "\n",
);
console.log(total);
