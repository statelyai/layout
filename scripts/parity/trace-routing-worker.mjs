// Observes installed real ELK only. No worker algorithm is replaced.
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
const pipelineCalls = {};
for (const name of ["$doCompoundLayout", "$doLayout", "$split_2", "$combine"]) {
  const original = context[name];
  context[name] = (...args) => {
    pipelineCalls[name] = (pipelineCalls[name] ?? 0) + 1;
    return original(...args);
  };
}
const stages = [],
  sweepEvents = [],
  sweepScopes = [],
  scopes = new WeakMap(),
  observed = new WeakSet();
let scopeCount = 0;
const originId = (value) => {
  const origin = context.$getProperty(value, context.ORIGIN_0);
  return origin?.identifier ?? origin?.id ?? null;
};
const sweepOrder = (order) =>
  order.map((layer) =>
    layer.map((node) => ({
      origin: originId(node),
      type: node.type_0?.name_0,
    })),
  );
const initializeSweep = context.$initialize_5;
context.$initialize_5 = (processor, root) => {
  const result = initializeSweep(processor, root);
  for (const graph of processor.graphInfoHolders.array) {
    sweepScopes.push({
      scope: scopes.get(graph.lGraph),
      useBottomUp: graph.useBottomUp,
      sharedRandom: context.$getProperty(graph.lGraph, context.RANDOM_0) === processor.random_0,
      nodeRelative: graph.portDistributor instanceof context.NodeRelativePortDistributor,
      hasParent: graph.hasParent,
      parent: graph.parent_0 ? originId(graph.parent_0) : null,
      order: sweepOrder(graph.currentNodeOrder),
    });
  }
  return result;
};
const sweep = context.$sweepReducingCrossings;
context.$sweepReducingCrossings = (processor, graph, forward, firstSweep) => {
  const describe = (kind) => ({
    kind,
    scope: scopes.get(graph.lGraph),
    forward,
    firstSweep,
    order: sweepOrder(graph.currentNodeOrder),
  });
  sweepEvents.push(describe("enter"));
  const result = sweep(processor, graph, forward, firstSweep);
  sweepEvents.push({ ...describe("exit"), improved: Boolean(result) });
  return result;
};
const snapshot = (graph) => ({
  scope: scopes.get(graph),
  width: graph.size_0.x_0,
  height: graph.size_0.y_0,
  nodes: [
    ...graph.layerlessNodes.array,
    ...graph.layers.array.flatMap((layer) => layer.nodes.array),
  ].map((node) => ({
    origin: originId(node),
    type: node.type_0?.name_0,
    x: node.pos.x_0,
    y: node.pos.y_0,
    width: node.size_0.x_0,
    height: node.size_0.y_0,
    ports: node.ports.array.map((port) => ({
      x: port.pos.x_0,
      y: port.pos.y_0,
      side: port.side?.name_0,
      outgoing: port.outgoingEdges.array.length,
      outgoingEdges: port.outgoingEdges.array.map(originId),
      incomingEdges: port.incomingEdges.array.map(originId),
      incoming: port.incomingEdges.array.length,
    })),
  })),
  layers: graph.layers.array.map((layer) => layer.nodes.array.map((node) => originId(node))),
});
const bkCandidates = [];
const checkBk = context.$checkOrderConstraint;
context.$checkOrderConstraint = (graph, bal, monitor) => {
  const result = checkBk(graph, bal, monitor);
  bkCandidates.push({
    scope: scopes.get(graph),
    h: bal.hdir?.name_0,
    v: bal.vdir?.name_0,
    valid: result,
    size: context.$layoutSize(bal),
    nodes: graph.layers.array.flatMap((l) =>
      l.nodes.array.map((n) => ({
        id: originId(n),
        y: context.$doubleValue(bal.y_0[n.id_0]) + context.$doubleValue(bal.innerShift[n.id_0]),
        margin: n.margin,
        ports: n.ports.array.map((p) => ({
          y: p.pos.y_0,
          edges: [...p.incomingEdges.array, ...p.outgoingEdges.array].map(originId),
        })),
      })),
    ),
  });
  return result;
};
const prepare = context.$prepareGraphForLayout;
context.$prepareGraphForLayout = (configurator, graph) => {
  scopes.set(graph, scopeCount++);
  prepare(configurator, graph);
  const processors = context.$getProperty(graph, context.PROCESSORS).array;
  stages.push({ phase: "prepared", ...snapshot(graph) });
  for (const processor of processors) {
    if (observed.has(processor)) continue;
    observed.add(processor);
    const name = context.$getName(context.getClass__Ljava_lang_Class___devirtual$(processor));
    const process = processor.process;
    processor.process = function (graph, monitor) {
      process.call(this, graph, monitor);
      stages.push({ phase: name, ...snapshot(graph) });
    };
  }
};
const routingCalls = [];
let routingCall;
const coordinates = (list) => {
  const iterator = context.$listIterator_2(list, 0),
    values = [];
  while (iterator.currentNode !== iterator.this$01.tail) values.push(context.$next_9(iterator));
  return values;
};
const segmentsSnapshot = (list) =>
  list.array.map((segment) => ({
    incoming: coordinates(segment.incomingConnectionCoordinates),
    outgoing: coordinates(segment.outgoingConnectionCoordinates),
    start: segment.startPosition,
    end: segment.endPosition,
    slot: segment.routingSlot,
    ports: segment.ports.array.map((port) => ({
      node: originId(port.owner),
      side: port.side.name_0,
      incoming: port.incomingEdges.array.map(originId),
      outgoing: port.outgoingEdges.array.map(originId),
    })),
    dependencies: segment.outgoingSegmentDependencies.array.map((dependency) => ({
      target: list.array.indexOf(dependency.target),
      type: dependency.type_0.name_0,
      weight: dependency.weight,
    })),
  }));
const routeEdges = context.$routeEdges_0;
context.$routeEdges_0 = (generator, graph, sourceNodes, targetNodes, startPos) => {
  const parent = routingCall;
  routingCall = { scope: scopes.get(graph), startPos, events: [] };
  routingCalls.push(routingCall);
  const result = routeEdges(generator, graph, sourceNodes, targetNodes, startPos);
  routingCall.slots = result;
  routingCall.threshold = generator.criticalConflictThreshold;
  routingCall = parent;
  return result;
};
for (const name of ["breakNonCriticalCycles", "topologicalNumbering"]) {
  const original = context[name];
  context[name] = (...args) => {
    routingCall?.events.push({ phase: name + ":before", segments: segmentsSnapshot(args[0]) });
    const result = original(...args);
    routingCall?.events.push({ phase: name + ":after", segments: segmentsSnapshot(args[0]) });
    return result;
  };
}
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
const report = JSON.parse(
  fs.readFileSync(process.argv[2] ?? "docs/heuristics/compound-baseline/report.json", "utf8"),
);
const input = report.rows[Number(process.argv[4] ?? 0)]?.input;
if (!input) throw new Error("Requested compound report row does not exist");
const output = await elk.layout(structuredClone(input));
const destination = process.argv[3] ?? ".scratch/compound-worker-phases.json";
fs.writeFileSync(
  destination,
  JSON.stringify(
    {
      oracle: "elkjs@0.11.1",
      input,
      output,
      pipelineCalls,
      sweepScopes,
      sweepEvents,
      stages,
      bkCandidates,
      routingCalls,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ scopes: scopeCount, stages: stages.length, destination }));
