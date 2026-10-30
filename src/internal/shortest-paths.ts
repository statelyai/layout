import type { LayoutExecutionContext } from "../types";

type Entry = { node: number; distance: number };

function push(heap: Entry[], entry: Entry): void {
  let index = heap.length;
  heap.push(entry);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (heap[parent]!.distance <= entry.distance) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = entry;
}

function pop(heap: Entry[]): Entry {
  const first = heap[0]!;
  const last = heap.pop()!;
  if (heap.length) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1]!.distance < heap[child]!.distance) child++;
      if (heap[child]!.distance >= last.distance) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

/** Sparse Dijkstra searches retain a quadratic distance table for the stress objective. */
export function shortestPathDistances(
  neighbors: readonly ReadonlyMap<number, number>[],
  context?: Pick<LayoutExecutionContext, "throwIfAborted">,
): number[][] {
  return neighbors.map((_, source) => {
    context?.throwIfAborted();
    const distances = neighbors.map(() => Infinity);
    distances[source] = 0;
    const heap: Entry[] = [{ node: source, distance: 0 }];
    while (heap.length) {
      const current = pop(heap);
      if (current.distance !== distances[current.node]) continue;
      for (const [node, weight] of neighbors[current.node]!) {
        const distance = current.distance + weight;
        if (distance < distances[node]!) {
          distances[node] = distance;
          push(heap, { node, distance });
        }
      }
    }
    return distances;
  });
}
