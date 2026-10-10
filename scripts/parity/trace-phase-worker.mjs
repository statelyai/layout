// Observes installed real ELK only. No worker algorithm is replaced.
// Records, per layered scope: reversed edges, layers before dummy insertion,
// the initial crossing-minimization order and the final crossing order.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const source = fs.readFileSync(require.resolve("elkjs/lib/elk-worker.js"), "utf8");
const module = { exports: {} };
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  module,
  exports: module.exports,
});
context.global = context;
vm.runInContext(source, context);

let scopes = new WeakMap(),
  scopeCount = 0,
  stages = [],
  initialOrders = new Map();
const observed = new WeakSet();
const originId = (value) => {
  const origin = context.$getProperty(value, context.ORIGIN_0);
  return origin?.identifier ?? origin?.id ?? null;
};
const incidentEdges = (node) =>
  node.ports.array.flatMap((port) => [...port.incomingEdges.array, ...port.outgoingEdges.array]);
/**
 * Comparable token: real node id, `L:<edge>` for edge dummies, `X:<edge>` for
 * hierarchy boundary dummies, otherwise the dummy type.
 */
const token = (node) => {
  const type = node.type_0?.name_0;
  if (type === "NORMAL") return String(originId(node));
  if (type === "LONG_EDGE" || type === "LABEL" || type === "EXTERNAL_PORT") {
    const edge = incidentEdges(node)
      .map(originId)
      .find((id) => id != null);
    return edge == null ? type : `${type === "EXTERNAL_PORT" ? "X" : "L"}:${edge}`;
  }
  return type === "NORTH_SOUTH_PORT" ? "NS" : String(type);
};
const snapshot = (graph) => {
  const nodes = [
    ...graph.layerlessNodes.array,
    ...graph.layers.array.flatMap((l) => l.nodes.array),
  ];
  const edges = nodes.flatMap((node) => node.ports.array.flatMap((p) => p.outgoingEdges.array));
  const portLists = Object.fromEntries(
    nodes
      .filter((node) => node.type_0?.name_0 === "NORMAL")
      .map((node) => [
        String(originId(node)),
        node.ports.array.map((port) => ({
          name: originId(port),
          outgoing: port.outgoingEdges.array.map(originId),
          incoming: port.incomingEdges.array.map(originId),
        })),
      ]),
  );
  return {
    portLists,
    scope: scopes.get(graph),
    layers: graph.layers.array.map((layer) => layer.nodes.array.map(token)),
    edgeIds: [...new Set(edges.map(originId).filter((id) => id != null))],
    reversed: [
      ...new Set(edges.filter((e) => context.$getProperty(e, context.REVERSED)).map(originId)),
    ].filter((id) => id != null),
  };
};
const prepare = context.$prepareGraphForLayout;
context.$prepareGraphForLayout = (configurator, graph) => {
  scopes.set(graph, scopeCount++);
  prepare(configurator, graph);
  for (const processor of context.$getProperty(graph, context.PROCESSORS).array) {
    if (observed.has(processor)) continue;
    observed.add(processor);
    const name = context
      .$getName(context.getClass__Ljava_lang_Class___devirtual$(processor))
      .replace(/^.*\./, "");
    const process = processor.process;
    processor.process = function (layered, monitor) {
      process.call(this, layered, monitor);
      stages.push({ phase: name, ...snapshot(layered) });
    };
  }
};
// The first crossing count of a scope sees its order before any sweep.
let sweepEvents = [];
const count = context.$countCurrentNumberOfCrossings;
context.$countCurrentNumberOfCrossings = (self, gData) => {
  const scope = scopes.get(gData.lGraph);
  if (!initialOrders.has(scope))
    initialOrders.set(
      scope,
      gData.currentNodeOrder.map((layer) => layer.map(token)),
    );
  const crossings = count(self, gData);
  sweepEvents.push({ kind: "count", scope, crossings });
  return crossings;
};
const sweep = context.$sweepReducingCrossings;
context.$sweepReducingCrossings = (self, gData, forward, firstSweep) => {
  const result = sweep(self, gData, forward, firstSweep);
  sweepEvents.push({
    kind: "sweep",
    scope: scopes.get(gData.lGraph),
    forward,
    firstSweep,
    layers: gData.currentNodeOrder.map((layer) => layer.map(token)),
  });
  return result;
};
const Elk = require("elkjs/lib/elk-api.js");
const elk = new Elk({
  workerFactory: () => {
    const worker = new context.module.exports.Worker(),
      post = worker.postMessage;
    worker.postMessage = (message) => {
      context.message = JSON.stringify(message);
      post(vm.runInContext("JSON.parse(message)", context));
    };
    return worker;
  },
});

/** Lay out a copy of `input` with real ELK and return per-scope phase observations. */
export async function traceElkPhases(input) {
  scopes = new WeakMap();
  scopeCount = 0;
  stages = [];
  initialOrders = new Map();
  sweepEvents = [];
  const output = await elk.layout(structuredClone(input));
  const byScope = new Map();
  for (const stage of stages) {
    const scope = byScope.get(stage.scope) ?? { scope: stage.scope, stages: [] };
    scope.stages.push(stage);
    byScope.set(stage.scope, scope);
  }
  return {
    output,
    scopes: [...byScope.values()].map(({ scope, stages }) => {
      const at = (pattern) => stages.find((stage) => pattern.test(stage.phase));
      const last = (pattern) => stages.filter((stage) => pattern.test(stage.phase)).at(-1);
      const splitter = stages.findIndex((stage) => stage.phase === "LongEdgeSplitter");
      return {
        scope,
        edgeIds: stages[0]?.edgeIds ?? [],
        reversed: (at(/CycleBreaker$/) ?? stages[0])?.reversed ?? [],
        portLists: (at(/CycleBreaker$/) ?? stages[0])?.portLists ?? {},
        layering: (splitter > 0 ? stages[splitter - 1] : last(/Layerer$|Postprocessor$/))?.layers,
        initialOrder: initialOrders.get(scope),
        // A hierarchical layout minimizes crossings once, at the root; child
        // scopes record their order at the next processor.
        crossingOrder: (last(/CrossingMinimizer$/) ?? at(/InLayerConstraintProcessor$/))?.layers,
        sweeps: sweepEvents.filter((event) => event.scope === scope),
      };
    }),
  };
}
