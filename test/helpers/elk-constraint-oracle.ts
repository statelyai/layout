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

export interface BarycenterOracleInput {
  layer: string[];
  visits: [string, (number | string)[]][];
  associates: [string, string[]][];
  seed: number;
  forward: boolean;
}
/** Real LPorts/LEdges preserve the supplied port and incident-edge visitation order. */
export function elkAssociatedBarycenters(data: BarycenterOracleInput): {
  scores: Record<string, number | undefined>;
  nextFloat: number;
} {
  const graph = new context.LGraph();
  const free = new context.Layer(graph),
    fixed = new context.Layer(graph);
  free.id_0 = 0;
  fixed.id_0 = 1;
  const nodes = data.layer.map((id, index) => {
    const node = new context.LNode(graph);
    node.layer = free;
    node.id_0 = index;
    node.name = id;
    return node;
  });
  const byId = new Map(nodes.map((node) => [node.name, node]));
  const ranks: number[] = [];
  for (const [id, visits] of data.visits)
    for (const visit of visits) {
      const port = new context.LPort();
      context.$setNode(port, byId.get(id));
      const opposite = new context.LPort();
      if (typeof visit === "number") {
        const owner = new context.LNode(graph);
        owner.layer = fixed;
        context.$setNode(opposite, owner);
        opposite.id_0 = ranks.length;
        ranks.push(visit);
      } else context.$setNode(opposite, byId.get(visit));
      const edge = new context.LEdge();
      context.$setSource_0(edge, data.forward ? opposite : port);
      context.$setTarget_0(edge, data.forward ? port : opposite);
    }
  context.$clinit_InternalProperties_1();
  for (const [id, ids] of data.associates) {
    const list = new context.ArrayList();
    for (const associate of ids) list.add_2(byId.get(associate));
    context.$setProperty_0(byId.get(id), context.BARYCENTER_ASSOCIATES, list);
  }
  const random = new context.Random();
  context.$setSeed(random, Math.floor(data.seed / 2 ** 24), data.seed % 2 ** 24);
  const states = nodes.map((node) => new context.BarycenterHeuristic$BarycenterState(node));
  const heuristic = { random_0: random, portRanks: ranks, barycenterState: [states, []] };
  const list = new context.ArrayList();
  for (const node of nodes) list.add_2(node);
  context.$calculateBarycenters(heuristic, list, data.forward);
  return {
    scores: Object.fromEntries(
      nodes.map((node, i) => [node.name, states[i].barycenter ?? undefined]),
    ),
    nextFloat: context.$nextInternal(random, 24) / 2 ** 24,
  };
}

export interface CrossPortOracleInput {
  ports: { id: string; side: "NORTH" | "SOUTH"; x: number; input: boolean; output: boolean }[];
}
export function elkCrossPortOrder(data: CrossPortOracleInput): {
  order: string[];
  associates: string[];
} {
  const graph = new context.LGraph();
  const layers = Array.from({ length: 3 }, (_, i) => {
    const layer = new context.Layer(graph);
    layer.id_0 = i;
    graph.layers.add_2(layer);
    return layer;
  });
  const owner = new context.LNode(graph);
  owner.name = "owner";
  context.$setLayer_0(owner, layers[1]);
  context.$clinit_LayeredOptions();
  context.$clinit_PortConstraints();
  context.$setProperty_0(owner, context.PORT_CONSTRAINTS_0, context.FIXED_POS);
  const ordered = [...data.ports].sort((a, b) =>
    a.side !== b.side ? (a.side === "NORTH" ? -1 : 1) : a.side === "NORTH" ? a.x - b.x : b.x - a.x,
  );
  for (const entry of ordered) {
    const port = new context.LPort();
    port.name = entry.id;
    port.pos.x_0 = entry.x;
    context.$setSide(port, entry.side === "NORTH" ? context.NORTH_1 : context.SOUTH_0);
    context.$setNode(port, owner);
    for (const incoming of [true, false])
      if (incoming ? entry.input : entry.output) {
        const neighbor = new context.LNode(graph);
        context.$setLayer_0(neighbor, layers[incoming ? 0 : 2]);
        const opposite = new context.LPort();
        context.$setNode(opposite, neighbor);
        const edge = new context.LEdge();
        context.$setSource_0(edge, incoming ? opposite : port);
        context.$setTarget_0(edge, incoming ? port : opposite);
      }
  }
  new context.NorthSouthPortPreprocessor().process(graph, { begin() {}, done_1() {} });
  const label = (node: any): string =>
    node === owner ? "owner" : context.$getProperty(node.ports.array[0], context.ORIGIN_0).name;
  return {
    order: Array.from(layers[1].nodes.array, label),
    associates: Array.from(context.$getProperty(owner, context.BARYCENTER_ASSOCIATES).array, label),
  };
}

export interface OrthogonalCycleOracleInput {
  count: number;
  dependencies: { source: number; target: number; weight: number; critical: boolean }[];
  criticalOnly: boolean;
  seed: number;
}
export function elkOrthogonalCycles(data: OrthogonalCycleOracleInput) {
  const nodes = Array.from({ length: data.count }, () => new context.HyperEdgeSegment(null));
  context.$clinit_HyperEdgeSegmentDependency$DependencyType();
  for (const d of data.dependencies)
    new context.HyperEdgeSegmentDependency(
      d.critical ? context.CRITICAL : context.REGULAR,
      nodes[d.source],
      nodes[d.target],
      d.weight,
    );
  const list = new context.ArrayList();
  for (const node of nodes) list.add_2(node);
  const random = new context.Random();
  context.$setSeed(random, Math.floor(data.seed / 2 ** 24), data.seed % 2 ** 24);
  const backwards = context.detectCycles(list, data.criticalOnly, random);
  return {
    marks: nodes.map((n) => n.mark),
    backwards: Array.from(backwards.array, (d: any) => ({
      source: nodes.indexOf(d.source),
      target: nodes.indexOf(d.target),
      weight: d.weight,
      critical: d.type_0 === context.CRITICAL,
    })),
    nextFloat: context.$nextInternal(random, 24) / 2 ** 24,
  };
}

export interface OrthogonalSegmentsOracleInput {
  segments: { incoming: number[]; outgoing: number[] }[];
  conflictThreshold: number;
  criticalThreshold: number;
  seed: number;
}
export function elkOrthogonalSegments(data: OrthogonalSegmentsOracleInput) {
  const nodes = data.segments.map((s) => {
    const n = new context.HyperEdgeSegment(null);
    for (const value of s.incoming) context.$add_7(n.incomingConnectionCoordinates, value);
    for (const value of s.outgoing) context.$add_7(n.outgoingConnectionCoordinates, value);
    context.$recomputeExtent(n);
    return n;
  });
  const list = new context.ArrayList();
  for (const n of nodes) list.add_2(n);
  const generator = {
    conflictThreshold: data.conflictThreshold,
    criticalConflictThreshold: data.criticalThreshold,
  };
  let criticalCount = 0;
  for (let a = 0; a < nodes.length - 1; a++)
    for (let b = a + 1; b < nodes.length; b++)
      criticalCount += context.$createDependencyIfNecessary(generator, nodes[a], nodes[b]);
  const random = new context.Random();
  context.$setSeed(random, Math.floor(data.seed / 2 ** 24), data.seed % 2 ** 24);
  if (criticalCount >= 2)
    context.$splitSegments(
      new context.HyperEdgeSegmentSplitter(generator),
      context.detectCycles(list, true, random),
      list,
      data.criticalThreshold,
    );
  context.breakNonCriticalCycles(list, random);
  context.topologicalNumbering(list);
  const all = Array.from(list.array) as any[];
  const coords = (values: any) => {
    const output: number[] = [];
    const iterator = context.$listIterator_2(values, 0);
    while (iterator.currentNode !== values.tail) output.push(context.$next_9(iterator));
    return output;
  };
  return {
    segments: all.map((n) => ({
      incoming: coords(n.incomingConnectionCoordinates),
      outgoing: coords(n.outgoingConnectionCoordinates),
      start: n.startPosition,
      end: n.endPosition,
      slot: n.routingSlot,
      ...(n.splitPartner ? { partner: all.indexOf(n.splitPartner) } : {}),
      ...(n.splitBy ? { splitBy: all.indexOf(n.splitBy) } : {}),
    })),
    dependencies: all.flatMap((n, source) =>
      Array.from(n.outgoingSegmentDependencies.array, (d: any) => ({
        source,
        target: all.indexOf(d.target),
        critical: d.type_0 === context.CRITICAL,
        weight: d.weight,
      })),
    ),
    nextFloat: context.$nextInternal(random, 24) / 2 ** 24,
  };
}
