import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  createRoutingScheduler,
  mergeRoutingChanges,
  routeEdges,
  updateRoutes,
} from "../src/routing";
import type { RoutingUpdate } from "../src/routing";

const graph = () =>
  createGraph({
    id: "schedule",
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 300, y: 0, width: 40, height: 40 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });
const move = (input: ReturnType<typeof graph>, x: number) => ({
  ...input,
  nodes: input.nodes.map((node) => (node.id === "b" ? { ...node, x } : node)),
});

it("coalesces edits, applying only the latest geometry from the accepted snapshot", async () => {
  const a = graph(),
    b = move(a, 320),
    c = move(b, 340),
    results: RoutingUpdate[] = [];
  const errors: unknown[] = [];
  const scheduler = createRoutingScheduler({
    snapshot: routeEdges({ graph: a }),
    onUpdate: (value) => results.push(value),
    onError: (error) => errors.push(error),
  });
  scheduler.enqueue({ graph: b, changes: getDiff(a, b) });
  scheduler.enqueue({ graph: c, changes: getDiff(b, c) });
  await scheduler.flush();
  expect(errors).toEqual([]);
  expect(results).toHaveLength(1);
  expect([...scheduler.snapshot.routes]).toEqual([...routeEdges({ graph: c }).routes]);
});

it("discards an obsolete asynchronous result and recomputes cumulative changes", async () => {
  const a = graph(),
    b = move(a, 320),
    c = move(b, 340),
    results: RoutingUpdate[] = [];
  let resolve: (() => void) | undefined,
    calls = 0;
  const scheduler = createRoutingScheduler({
    snapshot: routeEdges({ graph: a }),
    onUpdate: (value) => results.push(value),
    onError: (error) => {
      throw error;
    },
    update(options, signal) {
      calls++;
      if (calls > 1) return updateRoutes(options);
      const result = updateRoutes(options);
      expect(signal.aborted).toBe(false);
      return new Promise((done) => {
        resolve = () => done(result);
      });
    },
  });
  scheduler.enqueue({ graph: b, changes: getDiff(a, b) });
  const flushed = scheduler.flush();
  scheduler.enqueue({ graph: c, changes: getDiff(b, c) });
  resolve!();
  await flushed;
  expect(calls).toBe(2);
  expect(results).toHaveLength(1);
  expect([...scheduler.snapshot.routes]).toEqual([...routeEdges({ graph: c }).routes]);
  scheduler.dispose();
  expect(() => scheduler.enqueue({ graph: c, changes: getDiff(c, c) })).toThrow("disposed");
});

it("composes addition, movement, replacement and removal without graph scans", () => {
  const a = graph(),
    b = { ...a, nodes: [...a.nodes, { ...a.nodes[0]!, id: "temporary" }] };
  const c = {
    ...b,
    nodes: b.nodes.map((node) => (node.id === "temporary" ? { ...node, x: 50 } : node)),
  };
  expect(mergeRoutingChanges([getDiff(a, b), getDiff(b, c), getDiff(c, a)])).toEqual(getDiff(a, a));
  const d = { ...a, nodes: a.nodes.filter((node) => node.id !== "a"), edges: [] };
  const e = { ...a, nodes: a.nodes.map((node) => (node.id === "a" ? { ...node, y: 40 } : node)) };
  const previous = routeEdges({ graph: a });
  const update = updateRoutes({
    previous,
    graph: e,
    changes: mergeRoutingChanges([getDiff(a, d), getDiff(d, e)]),
  });
  expect([...update.snapshot.routes]).toEqual([...routeEdges({ graph: e }).routes]);
});

it("schedules edits queued by an onUpdate microtask after the running drain exits", async () => {
  const a = graph(),
    b = move(a, 320),
    c = move(b, 340),
    results: RoutingUpdate[] = [];
  let completed: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    completed = resolve;
  });
  const scheduler = createRoutingScheduler({
    snapshot: routeEdges({ graph: a }),
    onError: (error) => {
      throw error;
    },
    onUpdate(result) {
      results.push(result);
      if (results.length === 1)
        queueMicrotask(() => scheduler.enqueue({ graph: c, changes: getDiff(b, c) }));
      else completed!();
    },
  });
  scheduler.enqueue({ graph: b, changes: getDiff(a, b) });
  await done;
  expect(results).toHaveLength(2);
  expect([...scheduler.snapshot.routes]).toEqual([...routeEdges({ graph: c }).routes]);
  scheduler.dispose();
});
