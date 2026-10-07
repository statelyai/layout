import {
  separateOpposingTracks,
  type TrackPoint,
  type TrackPort,
  type TrackRect,
  type TrackRoute,
} from "../layered/opposing-tracks";
import type { ElkEdge, ElkNode } from "./types";

const option = (options: Readonly<Record<string, unknown>> | undefined, suffix: string) =>
  Object.entries(options ?? {}).find(([key]) => key === suffix || key.endsWith(`.${suffix}`))?.[1];

/**
 * Separate opposite-direction track sharing in a finished ELK JSON layout,
 * across nested containers, in world coordinates.
 */
export function separateElkOpposingTracks(
  root: ElkNode,
  options: Readonly<Record<string, unknown>>,
): void {
  const orthogonal = (node: ElkNode, inherited: boolean) => {
    const value = option(node.layoutOptions, "edgeRouting");
    return value === undefined ? inherited : String(value) === "ORTHOGONAL";
  };
  const rootOrthogonal = orthogonal(
    root,
    String(option(options, "edgeRouting") ?? "ORTHOGONAL") === "ORTHOGONAL",
  );
  const frames = new Map<string, TrackPoint>([[String(root.id), { x: 0, y: 0 }]]);
  const routing = new Map<string, boolean>([[String(root.id), rootOrthogonal]]);
  const nodes = new Map<string, TrackRect>(),
    leaves = new Set<string>(),
    owner = new Map<string, string>(),
    ports = new Map<string, TrackPort>();
  const place = (parent: ElkNode, offset: TrackPoint) => {
    for (const child of parent.children ?? []) {
      const id = String(child.id);
      const at = { x: offset.x + (child.x ?? 0), y: offset.y + (child.y ?? 0) };
      frames.set(id, at);
      routing.set(id, orthogonal(child, routing.get(String(parent.id)) ?? rootOrthogonal));
      nodes.set(id, { ...at, width: child.width ?? 0, height: child.height ?? 0 });
      owner.set(id, id);
      for (const port of child.ports ?? []) {
        owner.set(String(port.id), id);
        ports.set(String(port.id), {
          node: id,
          rect: {
            x: at.x + (port.x ?? 0),
            y: at.y + (port.y ?? 0),
            width: port.width ?? 0,
            height: port.height ?? 0,
          },
        });
      }
      if (child.children?.length) place(child, at);
      else leaves.add(id);
    }
  };
  place(root, { x: 0, y: 0 });
  const records: Array<{ edge: ElkEdge; offset: TrackPoint; route: TrackRoute }> = [];
  const collect = (parent: ElkNode) => {
    for (const edge of parent.edges ?? []) {
      // Multi-section routes are not single polylines; leave them unmeasured.
      if ((edge.sections?.length ?? 0) > 1) continue;
      const container = String(edge.container ?? parent.id);
      const offset = frames.get(container) ?? { x: 0, y: 0 };
      const sections = edge.sections ?? [];
      const points = sections.flatMap((section) =>
        [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
        })),
      );
      const axisParallel = points.every(
        (p, i) =>
          i === 0 ||
          Math.abs(p.x - points[i - 1]!.x) < 1e-6 ||
          Math.abs(p.y - points[i - 1]!.y) < 1e-6,
      );
      const ends = [edge.sources?.[0] ?? edge.source, edge.targets?.[0] ?? edge.target].flatMap(
        (end) => {
          const id = owner.get(String(end));
          return id === undefined ? [] : [id];
        },
      );
      const portOf = (end: unknown) => (ports.has(String(end)) ? String(end) : undefined);
      records.push({
        edge,
        offset,
        route: {
          id: String(edge.id),
          ends,
          points,
          ports: [
            portOf(edge.sources?.[0] ?? edge.source),
            portOf(edge.targets?.[0] ?? edge.target),
          ],
          labels: (edge.labels ?? []).flatMap((label) =>
            label.width && label.height
              ? [
                  {
                    x: (label.x ?? 0) + offset.x,
                    y: (label.y ?? 0) + offset.y,
                    width: label.width,
                    height: label.height,
                  },
                ]
              : [],
          ),
          movable: points.length > 0 && axisParallel && (routing.get(container) ?? rootOrthogonal),
        },
      });
    }
    for (const child of parent.children ?? []) collect(child);
  };
  collect(root);
  if (!records.some((record) => record.route.movable)) return;
  const spacing = Number(option(options, "spacing.edgeEdge") ?? 10);
  const changed = separateOpposingTracks({
    routes: records.map((record) => record.route),
    nodes,
    leaves,
    ports,
    spacing: Number.isFinite(spacing) && spacing > 0 ? spacing : 10,
  });
  if (!changed.size) return;
  const routes = new Map(
    records.map((record) => [record.route.id, changed.get(record.route.id) ?? record.route.points]),
  );
  const on = (point: TrackPoint, points: readonly TrackPoint[]) =>
    points.some((b, i) => {
      const a = points[i - 1];
      return (
        a !== undefined &&
        point.x >= Math.min(a.x, b.x) - 1e-6 &&
        point.x <= Math.max(a.x, b.x) + 1e-6 &&
        point.y >= Math.min(a.y, b.y) - 1e-6 &&
        point.y <= Math.max(a.y, b.y) + 1e-6
      );
    });
  for (const { edge, offset, route } of records) {
    const points = changed.get(route.id);
    if (points) {
      const section = edge.sections![0]!;
      const local = points.map((p) => ({ x: p.x - offset.x, y: p.y - offset.y }));
      section.startPoint = local[0]!;
      section.endPoint = local.at(-1)!;
      section.bendPoints = local.slice(1, -1);
    }
    // A junction marks where routes part; keep only those still shared.
    if (!edge.junctionPoints?.length) continue;
    const own = routes.get(route.id)!;
    edge.junctionPoints = edge.junctionPoints.filter((junction) => {
      const point = { x: junction.x + offset.x, y: junction.y + offset.y };
      return (
        on(point, own) && [...routes].some(([id, other]) => id !== route.id && on(point, other))
      );
    });
    if (!edge.junctionPoints.length) delete edge.junctionPoints;
  }
}
