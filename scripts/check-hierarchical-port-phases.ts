// Development oracle only: production code never imports elkjs or this harness.
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { JavaRandom } from "../src/java-random";
import {
  createExternalPortDummy,
  attachExternalPortDummy,
  externalPortDummyOf,
} from "../src/layered/external-port-dummy";
import {
  hierarchicalPortSides,
  prepareHierarchicalPortConstraints,
  sizeHierarchicalPortDummies,
} from "../src/layered/hierarchical-port-phases";
import { routeHierarchicalPorts } from "../src/layered/hierarchical-port-routing";
const require = createRequire(import.meta.url),
  module = { exports: {} };
const c: any = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  module,
  exports: module.exports,
});
c.global = c;
const workerSource = fs.readFileSync(require.resolve("elkjs/lib/elk-worker.js"), "utf8");
const workerSha256 = createHash("sha256").update(workerSource).digest("hex");
vm.runInContext(workerSource, c);
c.$clinit_LayeredOptions();
c.$clinit_InternalProperties_1();
c.$clinit_PortSide();
c.$clinit_PortConstraints();
c.$clinit_LNode$NodeType();
/** Check physical faces against the worker's actual initial transformer mode. */
export function checkHierarchicalPortDirections() {
  c.$clinit_Direction();
  c.$clinit_DirectionCongruency();
  c.$clinit_GraphTransformer$Mode();
  const sides = { WEST: c.WEST_0, EAST: c.EAST_0, NORTH: c.NORTH_1, SOUTH: c.SOUTH_0 };
  const directions = { right: c.RIGHT_6, left: c.LEFT_6, down: c.DOWN_1, up: c.UP_1 };
  const rows = [];
  for (const direction of ["right", "left", "down", "up"] as const)
    for (const congruency of ["READING_DIRECTION", "ROTATION"] as const)
      for (const physicalSide of ["WEST", "EAST", "NORTH", "SOUTH"] as const) {
        const graph = new c.LGraph(),
          node = new c.LNode(graph);
        graph.layerlessNodes.add_2(node);
        c.$setType(node, c.EXTERNAL_PORT);
        c.$setProperty_0(node, c.EXT_PORT_SIDE, sides[physicalSide]);
        c.$setProperty_0(graph, c.DIRECTION, directions[direction]);
        c.$setProperty_0(graph, c.DIRECTION_CONGRUENCY_0, c[congruency]);
        c.$process_12(new c.GraphTransformer(c.TO_INPUT_DIRECTION), graph, {
          begin() {},
          done_1() {},
        });
        const physical = hierarchicalPortSides({
          direction,
          settings: { directionCongruency: congruency },
        });
        const actual =
          physicalSide === physical.before
            ? "WEST"
            : physicalSide === physical.after
              ? "EAST"
              : physicalSide === physical.north
                ? "NORTH"
                : "SOUTH";
        rows.push({
          direction,
          congruency,
          physicalSide,
          actual,
          expected: c.$getProperty(node, c.EXT_PORT_SIDE).name_0,
        });
      }
  return { cases: rows.length, rows, failures: rows.filter((row) => row.actual !== row.expected) };
}

export function checkHierarchicalPortPhases(asymmetric = false) {
  const monitor = { begin() {}, done_1() {} };
  const random = new JavaRandom(912718);
  const failures = [];
  const rows = [];
  for (let seed = 1; seed <= 128; seed++) {
    const constraints = ["FIXED_SIDE", "FIXED_ORDER", "FIXED_POS", "FIXED_RATIO"][seed % 4]!;
    const layerCount = 2 + random.nextInt(4),
      normalCount = 2 + random.nextInt(6),
      externalCount = 1 + random.nextInt(4);
    const layers: string[][] = Array.from({ length: layerCount }, () => []),
      nodes: any[] = [],
      edges: any[] = [];
    for (let i = 0; i < normalCount; i++) {
      const id = `n${i}`;
      nodes.push({
        id,
        width: 80,
        height: 60,
        ports: [
          { name: `${id}:in`, direction: "in", x: 0, y: 0 },
          { name: `${id}:out`, direction: "out", x: 0, y: 0 },
        ],
      });
      layers[random.nextInt(layerCount)]!.push(id);
    }
    for (let i = 0; i < externalCount; i++) {
      const id = `p${i}`,
        side = i % 2 ? "SOUTH" : "NORTH";
      const origin = createExternalPortDummy({
        constraints: constraints as any,
        side,
        direction: "RIGHT",
        netFlow: 1,
        borderOffset: 0,
        size: { width: 4, height: 4 },
        ownerSize: { width: 160, height: 120 },
        position: { x: i * 20, y: 0 },
        index: i,
      });
      nodes.push(
        attachExternalPortDummy(
          {
            id,
            width: origin.width,
            height: origin.height,
            ports: [
              { name: `${id}:boundary`, direction: "inout", x: origin.port.x, y: origin.port.y },
            ],
          },
          origin,
        ),
      );
      layers[random.nextInt(layerCount)]!.push(id);
    }
    for (let i = 0; i < normalCount; i++) {
      const count = 1 + random.nextInt(3);
      for (let j = 0; j < count; j++) {
        const p = `p${random.nextInt(externalCount)}`,
          n = `n${i}`,
          out = Boolean(random.nextInt(2));
        edges.push({
          id: `e${edges.length}`,
          sourceId: out ? p : n,
          targetId: out ? n : p,
          sourcePort: out ? `${p}:boundary` : `${n}:out`,
          targetPort: out ? `${n}:in` : `${p}:boundary`,
        });
      }
    }
    const retainedInput = structuredClone({
      nodes,
      edges,
      layers,
      constraints,
      externalPorts: nodes.flatMap((node) => {
        const origin = externalPortDummyOf(node);
        return origin ? [{ id: node.id, origin }] : [];
      }),
    });
    const input: any = {
      graph: { id: "g", nodes, edges },
      sizes: new Map(nodes.map((n) => [n.id, { width: n.width, height: n.height }])),
      direction: "right",
      spacing: { node: 20, layer: 20 },
      padding: { left: 12, right: 12, top: 12, bottom: 12 },
      settings: { portConstraints: constraints, "spacing.edgeEdgeBetweenLayers": 10 },
      constrainedLayerByNodeId: new Map(),
    };
    const assignment = {
      layerCount,
      layerByNodeId: new Map(layers.flatMap((layer, i) => layer.map((id) => [id, i] as const))),
      seedOrder: layers.flat(),
    };
    const graph = new c.LGraph();
    c.$setProperty_0(graph, c.PORT_CONSTRAINTS_0, c[constraints]);
    c.$setProperty_0(graph, c.SPACING_EDGE_EDGE_BETWEEN_LAYERS_0, 10);
    const realLayers = layers.map(() => {
      const layer = new c.Layer(graph);
      graph.layers.add_2(layer);
      return layer;
    });
    const realNodes = new Map<string, any>(),
      realPorts = new Map<string, any>();
    for (const node of nodes) {
      const n = new c.LNode(graph);
      n.name = node.id;
      n.size_0.x_0 = node.width;
      n.size_0.y_0 = node.height;
      const origin = externalPortDummyOf(node);
      c.$setType(n, origin ? c.EXTERNAL_PORT : c.NORMAL);
      c.$setProperty_0(n, c.ORIGIN_0, { id: node.id });
      c.$setProperty_0(n, c.PORT_CONSTRAINTS_0, origin ? c.FIXED_POS : c.FREE);
      if (origin) {
        c.$setProperty_0(n, c.EXT_PORT_SIDE, c[origin.side === "NORTH" ? "NORTH_1" : "SOUTH_0"]);
        c.$setProperty_0(n, c.PORT_RATIO_OR_POSITION_0, origin.ratioOrPosition ?? 0);
        c.$setProperty_0(n, c.PORT_ANCHOR, new c.KVector_1(origin.anchor.x, origin.anchor.y));
        c.$setProperty_0(
          n,
          c.EXT_PORT_SIZE,
          new c.KVector_1(origin.externalSize.width, origin.externalSize.height),
        );
      }
      for (const port of node.ports) {
        const p = new c.LPort();
        c.$setNode(p, n);
        c.$setSide(
          p,
          origin
            ? c[origin.port.side === "NORTH" ? "NORTH_1" : "SOUTH_0"]
            : port.direction === "in"
              ? c.WEST_0
              : c.EAST_0,
        );
        p.pos.x_0 = port.x;
        p.pos.y_0 = port.y;
        realPorts.set(port.name, p);
      }
      realNodes.set(node.id, n);
    }
    for (const [index, layer] of layers.entries())
      for (const id of layer) c.$setLayer_0(realNodes.get(id), realLayers[index]);
    const realEdges = new Map<string, any>();
    for (const edge of edges) {
      const e = new c.LEdge();
      realEdges.set(edge.id, e);
      c.$setProperty_0(e, c.ORIGIN_0, { id: edge.id });
      c.$setSource_0(e, realPorts.get(edge.sourcePort));
      c.$setTarget_0(e, realPorts.get(edge.targetPort));
    }
    c.$process_14(graph, monitor);
    const prep = prepareHierarchicalPortConstraints(
      input,
      { reversedEdgeIds: new Set() },
      assignment,
    );
    const idsByLayer = Array.from(
      {
        length:
          prep.assignment.layerCount ?? Math.max(...prep.assignment.layerByNodeId.values()) + 1,
      },
      () => [] as string[],
    );
    for (const id of prep.assignment.seedOrder!)
      idsByLayer[prep.assignment.layerByNodeId.get(id)!]!.push(id);
    const normalizedNative = (nativeInput: any) =>
      idsByLayer.map((layer, layerIndex) =>
        layer.map((id) => {
          const n = nativeInput.graph.nodes.find((n: any) => n.id === id)!;
          const record = [...prep.replacements.values()].find((r) => r.helper.id === id);
          return {
            id: record ? `${record.original.id}@${layerIndex}` : id,
            width: n.width,
            height: n.height,
            ports: n.ports.map((p: any) => ({
              x: p.x,
              y: p.y,
              side: record
                ? p.direction === "in"
                  ? "WEST"
                  : "EAST"
                : p.direction === "in"
                  ? "WEST"
                  : "EAST",
              incoming: nativeInput.graph.edges
                .filter((e: any) => e.targetId === id && e.targetPort === p.name)
                .map((e: any) => e.id),
              outgoing: nativeInput.graph.edges
                .filter((e: any) => e.sourceId === id && e.sourcePort === p.name)
                .map((e: any) => e.id),
            })),
          };
        }),
      );
    const normalizedReal = () =>
      graph.layers.array.map((layer: any, layerIndex: number) =>
        layer.nodes.array.map((n: any) => {
          const original = c.$getProperty(n, c.EXT_PORT_REPLACED_DUMMY);
          return {
            id: original ? `${original.name}@${layerIndex}` : n.name,
            width: n.size_0.x_0,
            height: n.size_0.y_0,
            ports: n.ports.array.map((p: any) => ({
              x: p.pos.x_0,
              y: p.pos.y_0,
              side: p.side.name_0,
              incoming: p.incomingEdges.array.map((e: any) => c.$getProperty(e, c.ORIGIN_0).id),
              outgoing: p.outgoingEdges.array.map((e: any) => c.$getProperty(e, c.ORIGIN_0).id),
            })),
          };
        }),
      );
    const actual = normalizedNative(prep.input),
      expected = normalizedReal();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      failures.push({
        seed,
        phase: "constraints",
        input: { nodes, edges, layers, constraints },
        actual,
        expected,
      });
    c.$process_15(graph, monitor);
    const sized = sizeHierarchicalPortDummies(prep.input, { layers: idsByLayer }, prep);
    const actualSize = normalizedNative(sized),
      expectedSize = normalizedReal();
    if (JSON.stringify(actualSize) !== JSON.stringify(expectedSize))
      failures.push({
        seed,
        phase: "size",
        input: { nodes, edges, layers, constraints },
        actual: actualSize,
        expected: expectedSize,
      });
    const nativeRects = new Map<string, any>();
    for (const [layerIndex, layer] of idsByLayer.entries())
      for (const [index, id] of layer.entries()) {
        const n = sized.graph.nodes.find((node) => node.id === id)!;
        nativeRects.set(id, {
          x: layerIndex * 100,
          y: index * 80,
          width: n.width ?? 0,
          height: n.height ?? 0,
        });
        if (!externalPortDummyOf(n))
          for (const port of n.ports ?? []) {
            port.x = port.direction === "out" ? (n.width ?? 0) : 0;
            port.y = (n.height ?? 0) / 2;
          }
      }
    for (const [layerIndex, layer] of graph.layers.array.entries())
      for (const [index, node] of layer.nodes.array.entries()) {
        node.pos.x_0 = layerIndex * 100;
        node.pos.y_0 = index * 80;
        if (node.type_0 === c.NORMAL)
          for (const p of node.ports.array) {
            p.pos.x_0 = p.side === c.EAST_0 ? node.size_0.x_0 : 0;
            p.pos.y_0 = node.size_0.y_0 / 2;
          }
      }
    const graphSize = {
      width: Math.max(...[...nativeRects.values()].map((rect) => rect.x + rect.width)),
      height: Math.max(...[...nativeRects.values()].map((rect) => rect.y + rect.height)),
    };
    graph.size_0.x_0 = graphSize.width;
    graph.size_0.y_0 = graphSize.height;
    const padding = asymmetric
      ? {
          left: 7 + (seed % 13),
          right: 11 + (seed % 17),
          top: 5 + (seed % 19),
          bottom: 13 + (seed % 23),
        }
      : { left: 12, right: 12, top: 12, bottom: 12 };
    const offset = asymmetric ? { x: (seed % 7) - 3, y: (seed % 11) - 5 } : { x: 0, y: 0 };
    graph.padding.left = padding.left;
    graph.padding.right = padding.right;
    graph.padding.top_0 = padding.top;
    graph.padding.bottom = padding.bottom;
    graph.offset.x_0 = offset.x;
    graph.offset.y_0 = offset.y;
    const realRandom = new c.Random();
    c.$setSeed(realRandom, 0, 7);
    c.$setProperty_0(graph, c.RANDOM_0, realRandom);
    c.$setProperty_0(graph, c.SPACING_NODE_NODE_0, 20);
    c.$setProperty_0(graph, c.SPACING_EDGE_EDGE, 10);
    c.$setProperty_0(graph, c.SPACING_PORT_PORT, 10);
    const initialBends = new Map<string, any[]>();
    for (const edge of sized.graph.edges) {
      const src = sized.graph.nodes.find((node) => node.id === edge.sourceId)!,
        dst = sized.graph.nodes.find((node) => node.id === edge.targetId)!;
      const a = nativeRects.get(src.id),
        b = nativeRects.get(dst.id),
        ap = src.ports!.find((port) => port.name === edge.sourcePort)!,
        bp = dst.ports!.find((port) => port.name === edge.targetPort)!;
      const x = (a.x + (ap.x ?? 0) + b.x + (bp.x ?? 0)) / 2;
      const points = [
        { x, y: a.y + (ap.y ?? 0) },
        { x, y: b.y + (bp.y ?? 0) },
      ];
      initialBends.set(edge.id, points);
      for (const point of points)
        c.$add_7(realEdges.get(edge.id).bendPoints, new c.KVector_1(point.x, point.y));
    }
    const records = new Map(
      [...prep.replacements.values()].map((record) => [record.helper.id, record]),
    );
    const data = {
      constraints: constraints as any,
      size: graphSize,
      offset,
      padding,
      spacing: { node: 20, edge: 10, port: 10 },
      originals: [...prep.originals.values()].map((original) => ({
        id: original.id,
        origin: externalPortDummyOf(original)!,
      })),
      helpers: idsByLayer.flat().flatMap((id) => {
        const record = records.get(id);
        return record
          ? [
              {
                id,
                originalId: record.original.id,
                rect: nativeRects.get(id),
                incoming: sized.graph.edges
                  .filter((edge) => edge.targetId === id)
                  .map((edge) => edge.id),
                outgoing: sized.graph.edges
                  .filter((edge) => edge.sourceId === id)
                  .map((edge) => edge.id),
              },
            ]
          : [];
      }),
      bends: initialBends,
    };
    const restored = routeHierarchicalPorts(data, new JavaRandom(7));
    c.$process_16(new c.HierarchicalPortOrthogonalEdgeRouter(), graph, monitor);
    const nativePost = {
      size: restored.size,
      offset: restored.offset,
      rects: [...restored.rects],
      bends: [...restored.bends],
    };
    const realPost = {
      size: { width: graph.size_0.x_0, height: graph.size_0.y_0 },
      offset: { x: graph.offset.x_0, y: graph.offset.y_0 },
      rects: [...prep.originals.keys()].map((id) => {
        const node = realNodes.get(id);
        return [
          id,
          { x: node.pos.x_0, y: node.pos.y_0, width: node.size_0.x_0, height: node.size_0.y_0 },
        ];
      }),
      bends: [...realEdges].map(([id, edge]) => {
        const points = [];
        const it = edge.bendPoints.iterator_0();
        while (it.hasNext_0()) {
          const point = it.next_1();
          points.push({ x: point.x_0, y: point.y_0 });
        }
        return [id, points];
      }),
    };
    rows.push({
      seed,
      input: retainedInput,
      constraintPhase: { actual, expected },
      sizePhase: { actual: actualSize, expected: expectedSize },
      routingPhase: { actual: nativePost, expected: realPost },
    });
    if (JSON.stringify(nativePost) !== JSON.stringify(realPost))
      failures.push({
        seed,
        phase: "routing",
        input: { ...data, bends: [...data.bends] },
        actual: nativePost,
        expected: realPost,
      });
  }
  return { cases: 384, failures, rows };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reports = [checkHierarchicalPortPhases(), checkHierarchicalPortPhases(true)];
  const directions = checkHierarchicalPortDirections();
  const report = {
    oracle: "elkjs@0.11.1",
    workerSha256,
    seed: 912718,
    scope: "Canonical LTR intermediate phases, not public-layout parity",
    cases: 800,
    reports,
    directions,
  };
  const output = process.argv[2] ?? ".scratch/hierarchical-port-phases.json";
  const json = JSON.stringify(report, null, 2) + "\n";
  fs.writeFileSync(output, output.endsWith(".gz") ? gzipSync(json) : json);
  console.log({
    cases: report.cases,
    failures: reports.reduce((sum, r) => sum + r.failures.length, directions.failures.length),
    output,
  });
  if (directions.failures.length || reports.some((report) => report.failures.length))
    process.exitCode = 1;
}
