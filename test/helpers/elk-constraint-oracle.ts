// Development-only oracle: execute unmodified installed elkjs internals in an isolated VM.
// Production code never imports this helper or elkjs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve("elkjs/lib/elk-worker.js"), "utf8");
export const constraintOracleHash = createHash("sha256").update(source).digest("hex");
const module = { exports: {} };
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  module,
  exports: module.exports,
});
context.global = context;
vm.runInContext(source, context, { timeout: 20000 });
export interface ConstraintOracleInput {
  seed: string[];
  order: string[];
  normals: string[];
  units: [string, string][];
  successors: [string, string[]][];
  scores: Record<string, number>;
  normalConstraints?: boolean;
}
export function elkResolveConstraints(data: ConstraintOracleInput): {
  order: string[];
  scores: Record<string, number>;
} {
  const graph = new context.LGraph(),
    layer = new context.Layer(graph);
  layer.id_0 = 0;
  const nodes = data.seed.map((id, i) => {
    const n = new context.LNode(graph);
    n.layer = layer;
    n.id_0 = i;
    n.name = id;
    n.type_0 = data.normals.includes(id) ? context.NORMAL : context.NORTH_SOUTH_PORT;
    return n;
  });
  const byId = new Map(nodes.map((n) => [n.name, n]));
  context.$clinit_InternalProperties_1();
  if (data.normalConstraints)
    context.$setProperty_0(graph, context.IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES, true);
  for (const [id, owner] of data.units)
    context.$setProperty_0(byId.get(id), context.IN_LAYER_LAYOUT_UNIT, byId.get(owner));
  for (const [id, targets] of data.successors) {
    const list = context.$getProperty(byId.get(id), context.IN_LAYER_SUCCESSOR_CONSTRAINTS);
    for (const target of targets) list.add_2(byId.get(target));
  }
  const resolver = new context.ForsterConstraintResolver([nodes]);
  resolver.initAtLayerLevel(0, [nodes]);
  for (let i = 0; i < nodes.length; i++) {
    resolver.initAtNodeLevel(0, i, [nodes]);
    resolver.barycenterStates[0][i].barycenter = data.scores[nodes[i].name];
  }
  const list = new context.ArrayList();
  for (const id of data.order) list.add_2(byId.get(id));
  context.$processConstraints(resolver, list);
  return {
    order: list.array.map((n: { name: string }) => n.name),
    scores: Object.fromEntries(
      nodes.map((n) => [n.name, resolver.barycenterStates[0][n.id_0].barycenter]),
    ),
  };
}
