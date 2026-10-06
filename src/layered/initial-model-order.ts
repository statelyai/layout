/*
 * Copyright (c) 2020 Kiel University and others.
 * Native adaptation of ELK SortByInputModelProcessor and model-order comparators.
 * SPDX-License-Identifier: EPL-2.0
 */
import type { CrossingGraph, CrossingNode, CrossingPort } from "./crossing-counter";
import type { AcyclicOrientation, LayeredPhaseInput } from "./types";

/** ELK's insertion sort preserves comparator decisions even when model and edge priorities conflict. */
export function insertionSort<T>(items: T[], compare: (left: T, right: T) => number): void {
  for (let i = 1; i < items.length; i++) {
    const value = items[i]!;
    let j = i;
    while (j > 0 && compare(items[j - 1]!, value) > 0) {
      items[j] = items[j - 1]!;
      j--;
    }
    items[j] = value;
  }
}

/**
 * GWT's `Collections.sort` (elkjs): top-down merge sort over insertion-sorted runs
 * shorter than 7. Stateful comparators depend on this exact call sequence.
 */
function gwtSort<T>(items: T[], compare: (left: T, right: T) => number): void {
  const sort = (temp: T[], array: T[], low: number, high: number, ofs: number): void => {
    if (high - low < 7) {
      for (let i = low + 1; i < high; i++)
        for (let j = i; j > low && compare(array[j - 1]!, array[j]!) > 0; j--)
          [array[j - 1], array[j]] = [array[j]!, array[j - 1]!];
      return;
    }
    const tempLow = low + ofs,
      tempHigh = high + ofs,
      tempMid = tempLow + ((tempHigh - tempLow) >> 1);
    sort(array, temp, tempLow, tempMid, -ofs);
    sort(array, temp, tempMid, tempHigh, -ofs);
    if (compare(temp[tempMid - 1]!, temp[tempMid]!) <= 0) {
      for (let i = tempLow; low < high;) array[low++] = temp[i++]!;
      return;
    }
    for (let left = tempLow, right = tempMid; low < high;)
      array[low++] =
        right >= tempHigh || (left < tempMid && compare(temp[left]!, temp[right]!) <= 0)
          ? temp[left++]!
          : temp[right++]!;
  };
  sort(items.slice(), items, 0, items.length, 0);
}

/** Retain transitive decisions from earlier comparisons for this one sort. */
export function transitiveComparator<T>(
  key: (value: T) => string,
  compare: (left: T, right: T) => number,
  compareEqualKeys = false,
) {
  const follows = new Map<string, Set<string>>();
  return (left: T, right: T): number => {
    const a = key(left),
      b = key(right);
    // Shared-port helper comparisons intentionally retain ELK's nonzero tie.
    if (a === b) return compareEqualKeys ? compare(left, right) : 0;
    if (follows.get(a)?.has(b)) return -1;
    if (follows.get(b)?.has(a)) return 1;
    const result = compare(left, right);
    if (result) {
      const earlier = result < 0 ? a : b,
        later = result < 0 ? b : a;
      const descendants = new Set([later, ...(follows.get(later) ?? [])]);
      for (const predecessor of [
        earlier,
        ...[...follows].filter(([, values]) => values.has(earlier)).map(([id]) => id),
      ]) {
        const values = follows.get(predecessor) ?? new Set<string>();
        for (const id of descendants) values.add(id);
        follows.set(predecessor, values);
      }
    }
    return result;
  };
}

export function normalModelComparator(
  input: LayeredPhaseInput,
  respectGroupBoundary = true,
): (left: string, right: string) => number {
  const byId = new Map(input.graph.nodes.map((node, index) => [node.id, { node, index }]));
  const mode =
    input.settings["considerModelOrder.groupModelOrder.cmGroupOrderStrategy"] ??
    "ONLY_WITHIN_GROUP";
  const configured = input.settings["considerModelOrder.groupModelOrder.cmEnforcedGroupOrders"];
  const enforced = new Set<number>(
    Array.isArray(configured)
      ? configured.map(Number)
      : typeof configured === "string"
        ? (configured.match(/-?\d+/g) ?? []).map(Number)
        : [1, 2, 6, 7, 10, 11],
  );
  return (left, right) => {
    const a = byId.get(left),
      b = byId.get(right);
    if (!a || !b || left.startsWith("__layout_dummy:") || right.startsWith("__layout_dummy:"))
      return 0;
    const aa = input.nodeSettings?.(a.node),
      bb = input.nodeSettings?.(b.node);
    if (
      aa?.["considerModelOrder.noModelOrder"] === true ||
      bb?.["considerModelOrder.noModelOrder"] === true
    )
      return 0;
    if (
      [aa?.["layering.layerConstraint"], bb?.["layering.layerConstraint"]].some(
        (value) => value === "FIRST_SEPARATE" || value === "LAST_SEPARATE",
      )
    )
      return 0;
    const ag = Number(aa?.["considerModelOrder.groupModelOrder.crossingMinimizationId"] ?? 0),
      bg = Number(bb?.["considerModelOrder.groupModelOrder.crossingMinimizationId"] ?? 0);
    if (respectGroupBoundary && mode === "ONLY_WITHIN_GROUP" && ag !== bg) return 0;
    if (mode === "ENFORCED" && ag !== bg && enforced.has(ag) && enforced.has(bg)) return ag - bg;
    return a.index - b.index;
  };
}

/** Sort initial canonical nodes and physical ports before the first crossing attempt. */
function createModelOrderComparators(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  graph: CrossingGraph,
  incomingOrder?: ReadonlyMap<string, readonly string[]>,
) {
  const strategy = input.settings["considerModelOrder.strategy"] ?? "NONE";
  const owner = new Map(
    graph.layers.flat().flatMap((node) => node.ports.map((port) => [port.id, node] as const)),
  );
  const ports = new Map(
    graph.layers.flat().flatMap((node) => node.ports.map((port) => [port.id, port] as const)),
  );
  const layerByNode = new Map(
    graph.layers.flatMap((layer, i) => layer.map((node) => [node.id, i] as const)),
  );
  const nativeEdges = input.graph.edges.filter((edge) => edge.sourceId !== edge.targetId);
  const incoming = new Map<string, number[]>(),
    outgoing = new Map<string, number[]>();
  graph.edges.forEach((edge, i) => {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), i]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), i]);
  });
  for (const [port, indices] of incoming) {
    const order = incomingOrder?.get(owner.get(port)!.id);
    if (order)
      indices.sort((a, b) => order.indexOf(nativeEdges[a]!.id) - order.indexOf(nativeEdges[b]!.id));
  }
  const edgeOrder = (i: number) =>
    input.modelOrderByEdgeId?.get(nativeEdges[i]!.id) ?? input.graph.edges.indexOf(nativeEdges[i]!);
  const firstIncoming = (node: CrossingNode) =>
    node.ports.flatMap((port) => incoming.get(port.id) ?? [])[0];
  const sourcePort = (i: number) => ports.get(graph.edges[i]!.source)!;
  const targetPort = (i: number) => ports.get(graph.edges[i]!.target)!;
  const isHelper = (node: CrossingNode) => node.type !== "NORMAL";
  const targetNode = (port: CrossingPort): CrossingNode | undefined => {
    let i = outgoing.get(port.id)?.[0];
    const seen = new Set<string>();
    while (i !== undefined) {
      const node = owner.get(targetPort(i).id)!;
      if (!isHelper(node)) return node;
      if (seen.has(node.id)) return;
      seen.add(node.id);
      i = node.ports.flatMap((p) => outgoing.get(p.id) ?? [])[0];
    }
  };
  const nodeById = new Map(input.graph.nodes.map((node, index) => [node.id, { node, index }]));
  const nodeModel = (node: CrossingNode): number | undefined => {
    const original = nodeById.get(node.id);
    return !original ||
      isHelper(node) ||
      input.nodeSettings?.(original.node)?.["considerModelOrder.noModelOrder"] === true
      ? undefined
      : original.index;
  };
  const normalCompare = normalModelComparator(input, false);
  const sideOrder = { NORTH: 0, EAST: 1, SOUTH: 2, WEST: 3 };
  const portModel = (port: CrossingPort) => {
    const node = nodeById.get(owner.get(port.id)!.id)?.node;
    const names = node?.ports ?? [];
    return names.findIndex((p) => JSON.stringify([node!.id, p.name]) === port.id);
  };
  const portCompare = (
    previous: readonly CrossingNode[],
    targetOrder?: ReadonlyMap<string, number>,
  ) =>
    transitiveComparator<CrossingPort>(
      (p) => p.id,
      (a, b) => {
        if (a.side !== b.side) return sideOrder[a.side] - sideOrder[b.side];
        let reverse = 1;
        const ai = incoming.get(a.id)?.[0],
          bi = incoming.get(b.id)?.[0];
        const ao = outgoing.get(a.id)?.[0],
          bo = outgoing.get(b.id)?.[0];
        const authored = () =>
          portModel(a) >= 0 && portModel(b) >= 0 ? portModel(a) - portModel(b) : 0;
        if (ai !== undefined && bi !== undefined) {
          if (a.side !== "EAST") reverse = -reverse;
          const ap = sourcePort(ai),
            bp = sourcePort(bi),
            an = owner.get(ap.id)!,
            bn = owner.get(bp.id)!;
          if (an === bn) return reverse * (an.ports.indexOf(ap) - an.ports.indexOf(bp));
          const ar = previous.indexOf(an),
            br = previous.indexOf(bn);
          if (ar >= 0 || br >= 0) return reverse * (ar < 0 ? 1 : br < 0 ? -1 : ar - br);
          if (input.settings["considerModelOrder.portModelOrder"] === true && authored())
            return reverse * authored();
        }
        if (ao !== undefined && bo !== undefined) {
          if (a.side === "WEST" || a.side === "SOUTH") reverse = -reverse;
          const an = targetNode(a),
            bn = targetNode(b);
          if (
            strategy === "PREFER_NODES" &&
            an &&
            bn &&
            nodeModel(an) !== undefined &&
            nodeModel(bn) !== undefined
          )
            return reverse * (normalCompare(an.id, bn.id) || -1);
          if (input.settings["considerModelOrder.portModelOrder"] === true && authored())
            return reverse * authored();
          let ar = edgeOrder(ao),
            br = edgeOrder(bo);
          if (an && an === bn) return reverse * (ar > br ? 1 : -1);
          if (an && targetOrder?.has(an.id)) ar = targetOrder.get(an.id)!;
          if (bn && targetOrder?.has(bn.id)) br = targetOrder.get(bn.id)!;
          return reverse * (ar > br ? 1 : -1);
        }
        if (ai !== undefined && bo !== undefined) return 1;
        if (ao !== undefined && bi !== undefined) return -1;
        if (a.side === "WEST" || a.side === "SOUTH") reverse = -reverse;
        return reverse * (authored() || -1);
      },
      true,
    );
  const longMode = input.settings["considerModelOrder.longEdgeStrategy"] ?? "DUMMY_NODE_OVER";
  const missingEdgeOrder =
    longMode === "DUMMY_NODE_OVER" ? 2147483647 : longMode === "DUMMY_NODE_UNDER" ? -2147483648 : 0;
  const connectedEdgeOrder = (node: CrossingNode) => {
    const i = firstIncoming(node);
    return i === undefined ? missingEdgeOrder : edgeOrder(i);
  };
  const nodeCompare = (previous: readonly CrossingNode[], beforePorts: boolean) => {
    const compare = transitiveComparator<CrossingNode>(
      (node) => node.id,
      (a, b): number => {
        const am = nodeModel(a),
          bm = nodeModel(b);
        if (strategy === "PREFER_EDGES" || am === undefined || bm === undefined) {
          const previousSource = (node: CrossingNode) => {
            for (const p of node.ports) {
              const i = incoming.get(p.id)?.[0];
              if (
                i !== undefined &&
                layerByNode.get(owner.get(sourcePort(i).id)!.id) === layerByNode.get(node.id)! - 1
              )
                return sourcePort(i);
            }
          };
          const ap = previousSource(a),
            bp = previousSource(b);
          if (ap && bp) {
            const an = owner.get(ap.id)!,
              bn = owner.get(bp.id)!;
            if (an === bn && ap !== bp) return an.ports.indexOf(ap) - an.ports.indexOf(bp);
            if (an === bn) return -1;
            const ar = previous.indexOf(an),
              br = previous.indexOf(bn);
            if (ar >= 0 || br >= 0) return ar < 0 ? 1 : br < 0 ? -1 : ar - br;
          }
          const endpoints = (node: CrossingNode) => {
            const source = firstIncoming(node),
              next = node.ports.flatMap((p) => outgoing.get(p.id) ?? [])[0];
            const sourcePhysical = source === undefined ? undefined : sourcePort(source),
              targetPhysical = next === undefined ? undefined : targetPort(next);
            return {
              source: sourcePhysical && owner.get(sourcePhysical.id),
              target: targetPhysical && owner.get(targetPhysical.id),
              sourcePort: sourcePhysical,
              targetPort: targetPhysical,
            };
          };
          const helperCompare = (): number => {
            if (a.type === "LONG_EDGE" && b.type === "NORMAL") {
              const { source, target } = endpoints(a);
              const layer = layerByNode.get(a.id);
              if (
                layerByNode.get(source?.id ?? "") !== layer &&
                layerByNode.get(target?.id ?? "") !== layer
              )
                return 0;
              if (source === b || target === b) return 1;
              return source ? compare(source, b) : 0;
            }
            if (a.type === "NORMAL" && b.type === "LONG_EDGE") {
              const { source, target } = endpoints(b);
              const layer = layerByNode.get(a.id);
              if (
                layerByNode.get(source?.id ?? "") !== layer &&
                layerByNode.get(target?.id ?? "") !== layer
              )
                return 0;
              if (source === a || target === a) return -1;
              return source ? compare(a, source) : 0;
            }
            if (a.type !== "LONG_EDGE" || b.type !== "LONG_EDGE") return 0;
            const ae = endpoints(a),
              be = endpoints(b);
            const as = ae.source && layerByNode.get(ae.source.id) === layerByNode.get(a.id),
              at = !as && ae.target && layerByNode.get(ae.target.id) === layerByNode.get(a.id),
              bs = be.source && layerByNode.get(be.source.id) === layerByNode.get(b.id),
              bt = !bs && be.target && layerByNode.get(be.target.id) === layerByNode.get(b.id);
            const ar = as ? ae.source! : at ? ae.target! : a,
              br = bs ? be.source! : bt ? be.target! : b;
            if (ar === a && br === b) return 0;
            if (ar === br) {
              if (beforePorts) {
                if (as && bs && ae.sourcePort && be.sourcePort)
                  return portCompare(previous)(ae.sourcePort, be.sourcePort) > 0 ? 1 : -1;
                if (as && bt) return 1;
                if (at && bs) return -1;
                if (at && bt) return 0;
              } else {
                for (const port of ar.ports) {
                  if (port === ae.sourcePort) return -1;
                  if (port === be.sourcePort) return 1;
                }
              }
            }
            return ar === br ? 0 : compare(ar, br);
          };
          if (!ap || !bp) {
            const helperResult = helperCompare();
            if (helperResult !== 0) return helperResult;
          }
          if (!!ap !== !!bp && (am === undefined || bm === undefined))
            return connectedEdgeOrder(a) > connectedEdgeOrder(b) ? 1 : -1;
        }
        if (am !== undefined && bm !== undefined) return normalCompare(a.id, b.id) || -1;
        return -1;
      },
    );
    return compare;
  };
  const sort = () => {
    for (let layer = 0; layer < graph.layers.length; layer++) {
      const current = graph.layers[layer]!,
        previous = [...graph.layers[Math.max(0, layer - 1)]!];
      insertionSort(current, nodeCompare(previous, true));
      for (const node of current) {
        const constraint = input.nodeSettings?.(nodeById.get(node.id)!.node)?.portConstraints;
        if (
          constraint === "FIXED_ORDER" ||
          constraint === "FIXED_POS" ||
          constraint === "FIXED_RATIO"
        )
          continue;
        const targetOrder = new Map<string, number>();
        for (const p of node.ports) {
          const i = outgoing.get(p.id)?.[0],
            target = targetNode(p);
          if (i === undefined || !target || orientation.reversedEdgeIds.has(nativeEdges[i]!.id))
            continue;
          targetOrder.set(
            target.id,
            Math.min(targetOrder.get(target.id) ?? Number.MAX_SAFE_INTEGER, edgeOrder(i)),
          );
        }
        gwtSort(node.ports, portCompare(previous, targetOrder));
      }
      insertionSort(current, nodeCompare(previous, false));
    }
  };
  const countChanges = () => {
    let nodeChanges = 0,
      portChanges = 0;
    for (let layer = 0; layer < graph.layers.length; layer++) {
      const current = graph.layers[layer]!,
        previous = graph.layers[Math.max(0, layer - 1)]!;
      const compare = nodeCompare(previous, false);
      for (let i = 0; i < current.length; i++)
        for (let j = i + 1; j < current.length; j++) {
          if (
            nodeModel(current[i]!) !== undefined &&
            nodeModel(current[j]!) !== undefined &&
            compare(current[i]!, current[j]!) > 0
          )
            nodeChanges++;
        }
      for (const node of current) {
        const comparePort = portCompare(previous);
        for (let i = 0; i < node.ports.length; i++)
          for (let j = i + 1; j < node.ports.length; j++)
            if (comparePort(node.ports[i]!, node.ports[j]!) > 0) portChanges++;
      }
    }
    return { nodeChanges, portChanges };
  };
  return { sort, countChanges };
}

export function sortInitialModelOrder(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  graph: CrossingGraph,
  incomingOrder?: ReadonlyMap<string, readonly string[]>,
): void {
  createModelOrderComparators(input, orientation, graph, incomingOrder).sort();
}

export function countModelOrderChanges(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  graph: CrossingGraph,
): { nodeChanges: number; portChanges: number } {
  return createModelOrderComparators(input, orientation, graph).countChanges();
}

const preparedInputs = new WeakMap<LayeredPhaseInput, ReadonlyMap<string, readonly string[]>>();
export const markInitialModelOrderPrepared = (
  input: LayeredPhaseInput,
  ports: ReadonlyMap<string, readonly string[]>,
) => {
  preparedInputs.set(input, ports);
};
export const restoreInitialModelOrder = (
  input: LayeredPhaseInput,
  graph: CrossingGraph,
): boolean => {
  const prepared = preparedInputs.get(input);
  if (!prepared) return false;
  for (const node of graph.layers.flat()) {
    const order = prepared.get(node.id);
    if (order) node.ports.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return true;
};
