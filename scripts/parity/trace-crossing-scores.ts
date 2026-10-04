// Observe installed ELK's actual candidate orders; never replace its algorithms.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import {
  countAllCrossings,
  type CrossingGraph,
  type CrossingNode,
} from "../../src/layered/crossing-counter";
const require = createRequire(import.meta.url);
const module = { exports: {} };
const context: any = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  module,
  exports: module.exports,
});
context.global = context;
vm.runInContext(fs.readFileSync(require.resolve("elkjs/lib/elk-worker.js"), "utf8"), context);
const ids = new WeakMap<object, string>();
let nextId = 0;
const id = (value: object): string => {
  if (!ids.has(value)) ids.set(value, `v${nextId++}`);
  return ids.get(value)!;
};
const property = (value: object, key: any) =>
  context.$hasProperty(value, key) ? context.$getProperty(value, key) : undefined;
const snapshot = (order: any[][]): CrossingGraph => {
  const edges = new Set<any>();
  const layers = order.map((layer) =>
    layer.map((node) => {
      const unit = property(node, context.IN_LAYER_LAYOUT_UNIT);
      return {
        id: id(node),
        type: node.type_0.name_0 as CrossingNode["type"],
        ...(unit ? { unit: id(unit) } : {}),
        ports: node.ports.array.map((port: any) => {
          for (const edge of [...port.incomingEdges.array, ...port.outgoingEdges.array])
            edges.add(edge);
          const dummy = property(port, context.PORT_DUMMY),
            origin = property(port, context.ORIGIN_0);
          return {
            id: id(port),
            side: port.side.name_0,
            ...(dummy ? { dummy: id(dummy) } : {}),
            ...(node.type_0.name_0 === "NORTH_SOUTH_PORT" && origin ? { origin: id(origin) } : {}),
          };
        }),
      };
    }),
  );
  return {
    layers,
    edges: [...edges].map((edge) => ({ source: id(edge.source), target: id(edge.target) })),
  };
};
const samples: any[] = [],
  seen = new Map<string, any>();
let calls = 0,
  currentCase: any;
const original = context.$countAllCrossings;
context.$countAllCrossings = (counter: any, order: any[][]) => {
  const expected = original(counter, order);
  const graph = snapshot(order),
    actual = countAllCrossings(graph),
    actualEdges = countAllCrossings(graph, "edges");
  let expectedEdges = 0;
  if (order.length) {
    const cc = counter.crossingCounter;
    expectedEdges += context.$countInLayerCrossingsOnSide(cc, order[0], context.WEST_0);
    expectedEdges += context.$countInLayerCrossingsOnSide(cc, order.at(-1), context.EAST_0);
    for (let layer = 0; layer < order.length; layer++) {
      if (layer + 1 < order.length)
        expectedEdges += context.$countCrossingsBetweenLayers(cc, order[layer], order[layer + 1]);
      if (order[layer].some((node) => node.type_0.name_0 === "NORTH_SOUTH_PORT"))
        expectedEdges += context.$countNorthSouthPortCrossingsInLayer(cc, order[layer]);
    }
  }
  const key = JSON.stringify(graph);
  calls++;
  const previous = seen.get(key);
  if (previous) {
    previous.calls++;
    if (previous.expected !== expected || previous.expectedEdges !== expectedEdges)
      throw new Error("Same candidate has inconsistent ELK scores");
  } else {
    const sample = {
      case: currentCase,
      graph,
      expected,
      actual,
      expectedEdges,
      actualEdges,
      calls: 1,
    };
    samples.push(sample);
    seen.set(key, sample);
  }
  return expected;
};
const Elk = require("elkjs/lib/elk-api.js");
const elk = new Elk({
  workerFactory: () => {
    const worker = new context.module.exports.Worker(),
      post = worker.postMessage;
    worker.postMessage = (message: any) => {
      context.message = JSON.stringify(message);
      post(vm.runInContext("JSON.parse(message)", context));
    };
    return worker;
  },
});
const report = JSON.parse(
  fs.readFileSync(process.argv[2] ?? "docs/heuristics/port-aware-tracks/flat-report.json", "utf8"),
);
const indices = process.argv[4]
  ? process.argv[4].split(",").map(Number)
  : report.rows.map((_: any, index: number) => index);
const outcomes = [];
for (const index of indices) {
  const row = report.rows[index];
  if (!row?.input) throw new Error(`No input at index ${index}`);
  currentCase = {
    family: row.family ?? "flat",
    seed: row.seed,
    direction: row.direction,
    strategy: row.strategy,
  };
  try {
    await elk.layout(structuredClone(row.input));
    outcomes.push({ ...currentCase, success: true });
  } catch (error) {
    outcomes.push({ ...currentCase, error: String(error) });
  }
}
const summary = {
  cases: outcomes.length,
  calls,
  uniqueCandidates: samples.length,
  matched: samples.filter(
    (sample) =>
      sample.actual.total === sample.expected && sample.actualEdges.total === sample.expectedEdges,
  ).length,
  mismatched: samples.filter(
    (sample) =>
      sample.actual.total !== sample.expected || sample.actualEdges.total !== sample.expectedEdges,
  ).length,
  oracleErrors: outcomes.filter((row) => row.error).length,
};
const destination = process.argv[3] ?? ".scratch/crossing-scores.json";
fs.writeFileSync(
  destination,
  JSON.stringify({ oracle: "elkjs@0.11.1", summary, outcomes, samples }, null, 2) + "\n",
);
console.log(JSON.stringify({ ...summary, destination }));
process.exitCode = summary.mismatched || summary.oracleErrors ? 1 : 0;
