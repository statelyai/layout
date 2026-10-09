/*******************************************************************************
 * Copyright (c) 2010, 2016, 2020 Kiel University and others.
 * Adapted from ELK v0.11.0 OrthogonalRoutingGenerator, HyperEdgeSegment
 * and HyperedgeCrossingsCounter.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
export interface OrthogonalPort {
  id: string;
  side: "source" | "target";
  position: number;
}
export interface OrthogonalConnection {
  source: string;
  target: string;
}
/** ELK visits output ports on each boundary side, then recursively follows all connected edges. */
export function createOrthogonalHypersegments(
  ports: readonly OrthogonalPort[],
  connections: readonly OrthogonalConnection[],
  /** Position of a connection in its port's incoming or outgoing edge list, when known. */
  listRank?: (connection: number, list: "incoming" | "outgoing") => number | undefined,
) {
  const byId = new Map(ports.map((p) => [p.id, p]));
  const incoming = new Map(ports.map((p) => [p.id, [] as number[]]));
  const outgoing = new Map(ports.map((p) => [p.id, [] as number[]]));
  for (const [index, edge] of connections.entries()) {
    incoming.get(edge.target)!.push(index);
    outgoing.get(edge.source)!.push(index);
  }
  // ELK follows each port's edges in list order; fall back to connection order.
  if (listRank)
    for (const [lists, list] of [
      [incoming, "incoming"],
      [outgoing, "outgoing"],
    ] as const)
      for (const members of lists.values())
        members.sort((a, b) => {
          const ra = listRank(a, list),
            rb = listRank(b, list);
          return ra !== undefined && rb !== undefined ? ra - rb || a - b : a - b;
        });
  const segmentByPort = new Map<string, number>();
  const segments: Array<{ ports: string[]; incoming: number[]; outgoing: number[] }> = [];
  const visit = (id: string, index: number) => {
    if (segmentByPort.has(id)) return;
    segmentByPort.set(id, index);
    const port = byId.get(id)!,
      segment = segments[index]!;
    segment.ports.push(id);
    (port.side === "source" ? segment.incoming : segment.outgoing).push(port.position);
    for (const connection of incoming.get(id)!) visit(connections[connection]!.source, index);
    for (const connection of outgoing.get(id)!) visit(connections[connection]!.target, index);
  };
  for (const side of ["source", "target"] as const)
    for (const port of ports) {
      if (port.side !== side || outgoing.get(port.id)!.length === 0 || segmentByPort.has(port.id))
        continue;
      const index = segments.length;
      segments.push({ ports: [], incoming: [], outgoing: [] });
      visit(port.id, index);
    }
  for (const segment of segments) {
    segment.incoming = [...new Set(segment.incoming)].sort((a, b) => a - b);
    segment.outgoing = [...new Set(segment.outgoing)].sort((a, b) => a - b);
  }
  return { segments, segmentByPort };
}

/** ELK's hyperedge crossing estimate; positions are distinct ordinal port ranks on each side. */
export function countOrthogonalHypersegmentCrossings(
  ports: readonly OrthogonalPort[],
  connections: readonly OrthogonalConnection[],
): number {
  return scoreOrthogonalHypersegments(ports, connections).count;
}

/**
 * {@link countOrthogonalHypersegmentCrossings}, optionally separating shared
 * tracks. ELK routes a hyperedge on one shared track. When it joins two or
 * more ports on each side, its edges would run opposite ways along that
 * track, which routing never allows; `separateShared` counts such a
 * hyperedge's edges one by one instead. `shared` reports whether one exists.
 */
export function scoreOrthogonalHypersegments(
  ports: readonly OrthogonalPort[],
  connections: readonly OrthogonalConnection[],
  separateShared = false,
): { count: number; shared: boolean } {
  const { segments: merged, segmentByPort } = createOrthogonalHypersegments(ports, connections);
  const sharedSegments = new Set(
    merged.flatMap((s, i) => (s.incoming.length > 1 && s.outgoing.length > 1 ? [i] : [])),
  );
  let segments: ReadonlyArray<{ incoming: number[]; outgoing: number[] }> = merged;
  if (separateShared && sharedSegments.size) {
    const position = new Map(ports.map((p) => [p.id, p.position]));
    segments = [
      ...merged.filter((_, i) => !sharedSegments.has(i)),
      ...connections
        .filter((c) => sharedSegments.has(segmentByPort.get(c.source)!))
        .map((c) => ({ incoming: [position.get(c.source)!], outgoing: [position.get(c.target)!] })),
    ];
  }
  const spans = segments.map((s) => ({
    leftStart: Math.min(...s.incoming),
    leftEnd: Math.max(...s.incoming),
    rightStart: Math.min(...s.outgoing),
    rightEnd: Math.max(...s.outgoing),
  }));
  let count = 0;
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!,
        b = spans[j]!;
      if ((a.leftStart - b.leftStart) * (a.rightStart - b.rightStart) < 0) count++;
      if (a.leftStart < b.leftEnd && b.leftStart < a.leftEnd) count++;
      if (a.rightStart < b.rightEnd && b.rightStart < a.rightEnd) count++;
    }
  return { count, shared: sharedSegments.size > 0 };
}
