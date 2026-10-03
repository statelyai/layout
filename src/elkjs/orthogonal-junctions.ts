/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Adapted from ELK v0.11.0 BaseRoutingDirectionStrategy junction generation.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { ElkNode, ElkPoint } from "./types";
import {
  createOrthogonalHypersegments,
  type OrthogonalPort,
} from "../layered/orthogonal-hypersegments";
/** Reconstruct native segment spans from final orthogonal tracks, then emit ELK's unique junctions. */
export function applyOrthogonalJunctions(
  root: ElkNode,
  horizontal: boolean,
  increasing: boolean,
  mergeEdges: boolean,
  hypernodes: ReadonlySet<string>,
  preservedEdges: ReadonlySet<string>,
) {
  const edges = root.edges ?? [],
    ports: OrthogonalPort[] = [],
    byPort = new Map<string, OrthogonalPort>();
  const explicit = new Map(
    (root.children ?? []).flatMap((n) => (n.ports ?? []).map((p) => [String(p.id), n] as const)),
  );
  const owner = new Map((root.children ?? []).map((node) => [String(node.id), node]));
  for (const [id, node] of explicit) owner.set(id, node);
  const records = edges.flatMap((edge, index) => {
    if (preservedEdges.has(String(edge.id))) return [];
    const sourceOwner = owner.get(String(edge.sources?.[0] ?? edge.source));
    if (
      sourceOwner !== undefined &&
      sourceOwner === owner.get(String(edge.targets?.[0] ?? edge.target))
    )
      return [];
    const section = edge.sections?.[0];
    if (!section || edge.sections?.length !== 1) return [];
    let points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    if (
      points.some(
        (p, i) =>
          i > 0 &&
          Math.abs(p.x - points[i - 1]!.x) > 1e-3 &&
          Math.abs(p.y - points[i - 1]!.y) > 1e-3,
      )
    )
      return [];
    let source = String(edge.sources?.[0] ?? edge.source),
      target = String(edge.targets?.[0] ?? edge.target);
    const flow = (p: ElkPoint) => (horizontal ? p.x : p.y);
    if (flow(points[0]!) > flow(points.at(-1)!) === increasing) {
      points = [...points].reverse();
      [source, target] = [target, source];
    }
    const key = (ref: string, side: "source" | "target") =>
      explicit.has(ref)
        ? JSON.stringify(["port", ref])
        : mergeEdges || hypernodes.has(ref)
          ? JSON.stringify(["implicit", ref, side])
          : JSON.stringify(["edge", index, side]);
    return [{ edge, points, source: key(source, "source"), target: key(target, "target") }];
  });
  const cross = (p: ElkPoint) => (horizontal ? p.y : p.x),
    flow = (p: ElkPoint) => (horizontal ? p.x : p.y);
  for (const side of ["source", "target"] as const) {
    const ordered = [...records].sort(
      (a, b) =>
        cross(side === "source" ? a.points[0]! : a.points.at(-1)!) -
        cross(side === "source" ? b.points[0]! : b.points.at(-1)!),
    );
    for (const record of ordered) {
      const id = record[side];
      if (!byPort.has(id)) {
        const port = {
          id,
          side,
          position: cross(side === "source" ? record.points[0]! : record.points.at(-1)!),
        };
        byPort.set(id, port);
        ports.push(port);
      }
    }
  }
  const grouped = createOrthogonalHypersegments(
    ports,
    records.map((r) => ({ source: r.source, target: r.target })),
  );
  const created = new Set<string>();
  for (const group of grouped.segments) {
    const members = records.filter((r) => group.ports.includes(r.source));
    const tracks = new Map<
      number,
      { start: number; end: number; incoming: number[]; outgoing: number[] }
    >();
    const track = (point: ElkPoint) => {
      const key = flow(point);
      let t = tracks.get(key);
      if (!t) {
        t = { start: Infinity, end: -Infinity, incoming: [], outgoing: [] };
        tracks.set(key, t);
      }
      t.start = Math.min(t.start, cross(point));
      t.end = Math.max(t.end, cross(point));
      return t;
    };
    for (const r of members) {
      const bends = r.points.slice(1, -1);
      if (!bends.length) continue;
      for (const p of bends) track(p);
      track(bends[0]!).incoming.push(cross(bends[0]!));
      track(bends.at(-1)!).outgoing.push(cross(bends.at(-1)!));
      for (let i = 1; i < bends.length; i++)
        if (Math.abs(flow(bends[i]!) - flow(bends[i - 1]!)) > 1e-3) {
          track(bends[i - 1]!).outgoing.push(cross(bends[i - 1]!));
          track(bends[i]!).incoming.push(cross(bends[i]!));
        }
    }
    const routed = members.find((r) => r.points.length > 2);
    if (routed)
      for (const r of members.filter((r) => r.points.length === 2)) {
        track(routed.points[1]!).incoming.push(cross(r.points[0]!));
        track(routed.points.at(-2)!).outgoing.push(cross(r.points.at(-1)!));
      }
    for (const t of tracks.values()) {
      t.start = Math.min(t.start, ...t.incoming, ...t.outgoing);
      t.end = Math.max(t.end, ...t.incoming, ...t.outgoing);
    }
    for (const port of group.ports)
      for (const r of members.filter((r) => r.source === port)) {
        delete r.edge.junctionPoints;
        for (const p of r.points.slice(1, -1)) {
          const t = tracks.get(flow(p))!,
            value = cross(p),
            key = `${p.x}:${p.y}`;
          const boundary =
            t.incoming.length &&
            t.outgoing.length &&
            ((Math.abs(value - Math.min(...t.incoming)) < 1e-3 &&
              Math.abs(value - Math.min(...t.outgoing)) < 1e-3) ||
              (Math.abs(value - Math.max(...t.incoming)) < 1e-3 &&
                Math.abs(value - Math.max(...t.outgoing)) < 1e-3));
          if (!created.has(key) && ((value > t.start && value < t.end) || boundary)) {
            (r.edge.junctionPoints ??= []).push({ ...p });
            created.add(key);
          }
        }
      }
  }
}
