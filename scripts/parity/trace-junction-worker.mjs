// Observes the installed ELK worker. No layout algorithm is replaced.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const module = { exports: {} };
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  module,
  exports: module.exports,
});
context.global = context;
vm.runInContext(fs.readFileSync(require.resolve("elkjs/lib/elk-worker.js"), "utf8"), context);
const events = [];
const origin = (object) => {
  const value = context.$getProperty(object, context.ORIGIN_0);
  return value?.identifier ?? value?.id ?? null;
};
const emit = context.$addJunctionPointIfNecessary;
context.$addJunctionPointIfNecessary = (strategy, edge, segment, position, vertical) => {
  const before = context.$getProperty(edge, context.JUNCTION_POINTS)?.size_0 ?? 0;
  const result = emit(strategy, edge, segment, position, vertical);
  const after = context.$getProperty(edge, context.JUNCTION_POINTS)?.size_0 ?? 0;
  events.push({
    edge: origin(edge),
    source: origin(edge.source.owner),
    target: origin(edge.target.owner),
    sourceSide: edge.source.side.name_0,
    targetSide: edge.target.side.name_0,
    position: { x: position.x_0, y: position.y_0 },
    segment: { start: segment.startPosition, end: segment.endPosition, slot: segment.routingSlot },
    emitted: after > before,
  });
  return result;
};
const Elk = require("elkjs/lib/elk-api.js");
const oracle = new Elk({
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
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const input = report.rows[Number(process.argv[4] ?? 0)]?.input;
if (!input) throw new Error("Missing report row");
const output = await oracle.layout(structuredClone(input));
fs.writeFileSync(
  process.argv[3],
  JSON.stringify({ oracle: "elkjs@0.11.1", input, output, events }, null, 2) + "\n",
);
