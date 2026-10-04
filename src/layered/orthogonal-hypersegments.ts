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
) {
  const byId = new Map(ports.map((p) => [p.id, p]));
  const incoming = new Map(ports.map((p) => [p.id, [] as string[]]));
  const outgoing = new Map(ports.map((p) => [p.id, [] as string[]]));
  for (const edge of connections) {
    incoming.get(edge.target)!.push(edge.source);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const segmentByPort = new Map<string, number>();
  const segments: Array<{ ports: string[]; incoming: number[]; outgoing: number[] }> = [];
  const visit = (id: string, index: number) => {
    if (segmentByPort.has(id)) return;
    segmentByPort.set(id, index);
    const port = byId.get(id)!,
      segment = segments[index]!;
    segment.ports.push(id);
    (port.side === "source" ? segment.incoming : segment.outgoing).push(port.position);
    for (const peer of [...incoming.get(id)!, ...outgoing.get(id)!]) visit(peer, index);
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
  const { segments } = createOrthogonalHypersegments(ports, connections);
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
  return count;
}
