// Observe installed ELK's actual candidate orders; never replace its algorithms.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { type CrossingGraph, type CrossingNode } from "../../src/layered/crossing-counter";
import {
  CanonicalPortDistributor,
  type PortDistributionState,
} from "../../src/layered/port-distributor";
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
const samples: any[] = [];
let calls = 0,
  matchedCalls = 0,
  currentCase: any;
const retained = new Set<string>();
let persistentMatched = 0,
  persistentInputMatched = 0;
const sessions = new WeakMap<
  object,
  { graph: CrossingGraph; distributor: CanonicalPortDistributor; nodes: Map<string, CrossingNode> }
>();
const stateEquals = (actual: PortDistributionState, expected: PortDistributionState) =>
  (Object.keys(expected) as (keyof PortDistributionState)[]).every((key) =>
    Object.keys(expected[key]).every((id) => Object.is(actual[key][id], expected[key][id])),
  );
const stateOf = (processor: any, order: any[][]): PortDistributionState => {
  const state: PortDistributionState = { ranks: {}, barycenters: {}, positions: {} };
  for (const layer of order)
    for (const node of layer) {
      state.positions[id(node)] = processor.nodePositions[node.layer.id_0][node.id_0];
      for (const port of node.ports.array) {
        state.ranks[id(port)] = processor.portRanks[port.id_0];
        state.barycenters[id(port)] = processor.portBarycenter[port.id_0];
      }
    }
  return state;
};
let insideDistribution = false;
const originalRanks = context.$calculatePortRanks;
context.$calculatePortRanks = (processor: any, layer: any[], type: any) => {
  const session = sessions.get(processor);
  if (session && !insideDistribution && layer.length) {
    const index = layer[0].layer.id_0;
    const cachedLayer = layer.map((node) => {
      const cached = session.nodes.get(id(node))!;
      const ports = new Map(cached.ports.map((port) => [port.id, port]));
      cached.ports = node.ports.array.map((port: any) => ports.get(id(port))!);
      return cached;
    });
    session.graph.layers[index] = cachedLayer;
    session.distributor.calculatePortRanks(
      session.graph,
      cachedLayer,
      type.name_0 === "INPUT",
      processor instanceof context.NodeRelativePortDistributor,
    );
  }
  return originalRanks(processor, layer, type);
};
const original = context.$distributePortsWhileSweeping;
context.$distributePortsWhileSweeping = (
  processor: any,
  order: any[][],
  index: number,
  forward: boolean,
) => {
  const graph = snapshot(order),
    state = stateOf(processor, order);
  const options = {
    nodeRelative: processor instanceof context.NodeRelativePortDistributor,
    fixedOrder: order
      .flat()
      .filter((node) =>
        context.$isOrderFixed(context.$getProperty(node, context.PORT_CONSTRAINTS_0)),
      )
      .map(id),
    hierarchical: order
      .flat()
      .filter((node) => node.nestedGraph)
      .map(id),
  };
  const nativeGraph = structuredClone(graph);
  const native = new CanonicalPortDistributor(nativeGraph, state);
  native.distribute(nativeGraph, index, forward, {
    ...options,
    fixedOrder: new Set(options.fixedOrder),
    hierarchical: new Set(options.hierarchical),
  });
  let session = sessions.get(processor);
  if (!session) {
    const cachedGraph = structuredClone(graph);
    session = {
      graph: cachedGraph,
      distributor: new CanonicalPortDistributor(cachedGraph, state),
      nodes: new Map(cachedGraph.layers.flat().map((node) => [node.id, node])),
    };
    sessions.set(processor, session);
  }
  // Node/port order is an external sweep input; ranks and barycenters persist.
  const persistentInputMatches = stateEquals(session.distributor.state, state);
  if (persistentInputMatches) persistentInputMatched++;
  session.graph.layers = graph.layers.map((layer) =>
    layer.map((node) => {
      const cached = session!.nodes.get(node.id)!;
      const ports = new Map(cached.ports.map((port) => [port.id, port]));
      cached.ports = node.ports.map((port) => ports.get(port.id)!);
      return cached;
    }),
  );
  session.distributor.distribute(session.graph, index, forward, {
    ...options,
    fixedOrder: new Set(options.fixedOrder),
    hierarchical: new Set(options.hierarchical),
  });
  insideDistribution = true;
  const result = original(processor, order, index, forward);
  insideDistribution = false;
  const expected = snapshot(order),
    expectedState = stateOf(processor, order);
  const ports = (value: CrossingGraph) =>
    value.layers.flat().map((node) => ({ id: node.id, ports: node.ports.map((port) => port.id) }));
  const actualPorts = ports(nativeGraph),
    expectedPorts = ports(expected);
  const stateMatches = (Object.keys(state) as (keyof PortDistributionState)[]).every((key) =>
    Object.keys(state[key]).every((id) => Object.is(native.state[key][id], expectedState[key][id])),
  );
  const matched = JSON.stringify(actualPorts) === JSON.stringify(expectedPorts) && stateMatches;
  const persistentMatches =
    persistentInputMatches &&
    stateEquals(session.distributor.state, expectedState) &&
    JSON.stringify(ports(session.graph)) === JSON.stringify(expectedPorts);
  if (persistentMatches) persistentMatched++;
  calls++;
  if (matched) matchedCalls++;
  const key = JSON.stringify([currentCase, index, forward, options.nodeRelative]);
  if (!matched || !persistentMatches || !retained.has(key))
    samples.push({
      case: currentCase,
      graph,
      state,
      options,
      index,
      forward,
      expectedPorts,
      actualPorts,
      expectedState,
      actualState: native.state,
      matched,
      persistentMatches,
      persistentInputMatches,
    });
  retained.add(key);
  return result;
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
  matched: matchedCalls,
  persistentMatched,
  persistentInputMatched,
  persistentMismatched: calls - persistentMatched,
  mismatched: calls - matchedCalls,
  oracleErrors: outcomes.filter((row) => row.error).length,
};
const destination = process.argv[3] ?? ".scratch/port-distribution.json";
fs.writeFileSync(
  destination,
  JSON.stringify(
    { oracle: "elkjs@0.11.1", summary, outcomes, samples },
    (_key, value) =>
      typeof value === "number" && Object.is(value, -0) ? "__negative_zero__" : value,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ ...summary, destination }));
process.exitCode =
  summary.mismatched || summary.persistentMismatched || summary.oracleErrors ? 1 : 0;
