/// <reference lib="dom" />

import type { EdgeRouting, Point, PortDirection } from "@statelyai/graph";

export interface GeometryPort {
  name: string;
  direction: PortDirection;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryNode {
  id: string;
  parentId?: string | null;
  label?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  ports?: GeometryPort[];
}

export interface GeometryEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort?: string;
  targetPort?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
  routing?: EdgeRouting;
}

export interface GeometryGraph {
  nodes: GeometryNode[];
  edges: GeometryEdge[];
}

export interface GeometryOptions {
  grid: boolean;
  bounds: boolean;
  labels: boolean;
  points: boolean;
  ports: boolean;
}

export type GeometrySelection =
  | { kind: "graph"; bounds: GeometryBounds; graph: GeometryGraph }
  | { kind: "node"; node: GeometryNode; x: number; y: number }
  | { kind: "edge"; edge: GeometryEdge }
  | { kind: "port"; node: GeometryNode; port: GeometryPort; x: number; y: number };

export interface GeometryBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AbsoluteNode extends GeometryNode {
  absoluteX: number;
  absoluteY: number;
  isRoot: boolean;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function absoluteNodes(graph: GeometryGraph): AbsoluteNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const cache = new Map<string, Point>();

  const position = (node: GeometryNode, seen = new Set<string>()): Point => {
    const cached = cache.get(node.id);
    if (cached) return cached;
    if (seen.has(node.id)) return { x: node.x, y: node.y };
    seen.add(node.id);
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const parentPosition = parent ? position(parent, seen) : { x: 0, y: 0 };
    const result = { x: parentPosition.x + node.x, y: parentPosition.y + node.y };
    cache.set(node.id, result);
    return result;
  };

  return graph.nodes.map((node) => {
    const point = position(node);
    return {
      ...node,
      absoluteX: point.x,
      absoluteY: point.y,
      isRoot: node.parentId == null,
    };
  });
}

function includePoint(
  point: Point,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

export function getGeometryBounds(graph: GeometryGraph): GeometryBounds {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const node of absoluteNodes(graph)) {
    includePoint({ x: node.absoluteX, y: node.absoluteY }, bounds);
    includePoint({ x: node.absoluteX + node.width, y: node.absoluteY + node.height }, bounds);
    for (const port of node.ports ?? []) {
      includePoint({ x: node.absoluteX + port.x, y: node.absoluteY + port.y }, bounds);
      includePoint(
        { x: node.absoluteX + port.x + port.width, y: node.absoluteY + port.y + port.height },
        bounds,
      );
    }
  }
  for (const edge of graph.edges) {
    for (const point of edge.points ?? []) includePoint(point, bounds);
    if (edge.width > 0 || edge.height > 0) {
      includePoint({ x: edge.x, y: edge.y }, bounds);
      includePoint({ x: edge.x + edge.width, y: edge.y + edge.height }, bounds);
    }
  }
  if (!Number.isFinite(bounds.minX)) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}

export function geometryPath(points: readonly Point[], routing: EdgeRouting = "polyline"): string {
  const first = points[0];
  if (!first) return "";
  if (routing !== "splines") {
    return `M ${first.x} ${first.y}${points
      .slice(1)
      .map((point) => ` L ${point.x} ${point.y}`)
      .join("")}`;
  }
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index + 2 < points.length; index += 3) {
    const controlA = points[index]!;
    const controlB = points[index + 1]!;
    const end = points[index + 2]!;
    path += ` C ${controlA.x} ${controlA.y} ${controlB.x} ${controlB.y} ${end.x} ${end.y}`;
  }
  return path;
}

export function routeLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function makeInteractive(element: SVGElement, label: string, select: () => void): void {
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", label);
  element.addEventListener("click", select);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });
}

function appendText(
  parent: SVGElement,
  content: string,
  x: number,
  y: number,
  className: string,
  anchor?: "start" | "middle" | "end",
): SVGTextElement {
  const text = svgElement("text", { x, y, class: className });
  if (anchor) text.setAttribute("text-anchor", anchor);
  text.textContent = content;
  parent.append(text);
  return text;
}

function appendGrid(defs: SVGDefsElement, svg: SVGSVGElement): void {
  const pattern = svgElement("pattern", {
    id: "measurement-grid",
    width: 20,
    height: 20,
    patternUnits: "userSpaceOnUse",
  });
  pattern.append(svgElement("path", { d: "M 20 0 L 0 0 0 20", class: "geometry-grid-line" }));
  defs.append(pattern);
  svg.append(
    svgElement("rect", {
      x: "-10000",
      y: "-10000",
      width: "20000",
      height: "20000",
      fill: "url(#measurement-grid)",
      class: "geometry-grid",
    }),
  );
}

export function renderGeometry(
  container: HTMLElement,
  graph: GeometryGraph,
  options: GeometryOptions,
  onSelect: (selection: GeometrySelection) => void,
): void {
  container.replaceChildren();
  const bounds = getGeometryBounds(graph);
  const padding = 54;
  const svg = svgElement("svg", {
    class: "geometry-svg",
    viewBox: `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": `Graph geometry, ${graph.nodes.length - 1} nodes and ${graph.edges.length} edges`,
  });
  const defs = svgElement("defs");
  const marker = svgElement("marker", {
    id: "edge-arrow",
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: "auto-start-reverse",
  });
  marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "geometry-arrow" }));
  defs.append(marker);
  svg.append(defs);
  if (options.grid) appendGrid(defs, svg);

  const nodes = absoluteNodes(graph);
  const roots = nodes.filter((node) => node.isRoot);
  if (options.bounds) {
    for (const root of roots) {
      svg.append(
        svgElement("rect", {
          x: root.absoluteX,
          y: root.absoluteY,
          width: root.width,
          height: root.height,
          class: "geometry-root-bounds",
        }),
      );
    }
  }

  const edgeLayer = svgElement("g", { class: "geometry-edge-layer" });
  for (const edge of graph.edges) {
    const points = edge.points ?? [];
    const group = svgElement("g", { class: "geometry-edge" });
    const pathData = geometryPath(points, edge.routing);
    const hitPath = svgElement("path", {
      d: pathData,
      class: "geometry-edge-hit geometry-hit-target",
    });
    const path = svgElement("path", {
      d: pathData,
      class: "geometry-edge-path",
      "marker-end": points.length > 1 ? "url(#edge-arrow)" : "",
    });
    makeInteractive(hitPath, `Edge ${edge.id}`, () => onSelect({ kind: "edge", edge }));
    group.append(hitPath, path);
    if (options.points) {
      points.forEach((point, index) => {
        group.append(
          svgElement("circle", {
            cx: point.x,
            cy: point.y,
            r: index === 0 || index === points.length - 1 ? 4 : 3,
            class: index === 0 || index === points.length - 1 ? "route-endpoint" : "route-bend",
          }),
        );
        if (index > 0 && index < points.length - 1) {
          appendText(group, String(index), point.x + 6, point.y - 6, "route-point-label");
        }
      });
    }
    if (options.labels && edge.width > 0 && edge.height > 0) {
      group.append(
        svgElement("rect", {
          x: edge.x,
          y: edge.y,
          width: edge.width,
          height: edge.height,
          class: "geometry-label-bounds",
        }),
      );
      appendText(
        group,
        `${edge.id} · ${edge.width}×${edge.height}`,
        edge.x + edge.width / 2,
        edge.y + edge.height / 2 + 4,
        "geometry-edge-label",
        "middle",
      );
    }
    edgeLayer.append(group);
  }
  svg.append(edgeLayer);

  const nodeLayer = svgElement("g", { class: "geometry-node-layer" });
  for (const node of nodes.filter((candidate) => !candidate.isRoot)) {
    const group = svgElement("g", { class: "geometry-node" });
    const rect = svgElement("rect", {
      x: node.absoluteX,
      y: node.absoluteY,
      width: node.width,
      height: node.height,
      rx: 7,
      class: "geometry-node-rect geometry-hit-target",
    });
    makeInteractive(rect, `Node ${node.label ?? node.id}`, () =>
      onSelect({ kind: "node", node, x: node.absoluteX, y: node.absoluteY }),
    );
    group.append(rect);
    appendText(
      group,
      node.label ?? node.id,
      node.absoluteX + 10,
      node.absoluteY + 20,
      "geometry-node-label",
    );
    if (options.bounds) {
      appendText(
        group,
        `${node.width}×${node.height}  @ ${node.absoluteX}, ${node.absoluteY}`,
        node.absoluteX + 10,
        node.absoluteY + 38,
        "geometry-node-measure",
      );
    }
    if (options.ports) {
      for (const port of node.ports ?? []) {
        const x = node.absoluteX + port.x;
        const y = node.absoluteY + port.y;
        const portRect = svgElement("rect", {
          x,
          y,
          width: port.width,
          height: port.height,
          rx: 2,
          class: `geometry-port geometry-port-${port.direction} geometry-hit-target`,
        });
        makeInteractive(portRect, `Port ${node.id}.${port.name}`, () =>
          onSelect({ kind: "port", node, port, x, y }),
        );
        group.append(portRect);
        const onLeft = port.x < node.width / 2;
        appendText(
          group,
          port.label ?? port.name,
          x + (onLeft ? -5 : port.width + 5),
          y + port.height / 2 + 3,
          "geometry-port-label",
          onLeft ? "end" : "start",
        );
      }
    }
    nodeLayer.append(group);
  }
  svg.append(nodeLayer);

  const dimensions = appendText(
    svg,
    `${Math.round(bounds.width)} × ${Math.round(bounds.height)} layout units`,
    bounds.x,
    bounds.y - 20,
    "geometry-extent-label",
  );
  makeInteractive(dimensions, "Inspect graph bounds", () =>
    onSelect({ kind: "graph", bounds, graph }),
  );
  container.append(svg);
  onSelect({ kind: "graph", bounds, graph });
}
