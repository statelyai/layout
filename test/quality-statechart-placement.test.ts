import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { HARD, score } from "../scripts/parity/quality-gate";
import emailDrafter from "./fixtures/email-drafter-viz.json";
import vizFeedbackForm from "./fixtures/viz-feedback-form.json";
import systemRoutingLanes from "./fixtures/viz-system-routing-lanes.json";

const hard = (metrics: Record<string, number>) =>
  Object.fromEntries(HARD.map((key) => [key, metrics[key]]));
const clean = Object.fromEntries(HARD.map((key) => [key, 0]));
const layout = (input: unknown) => new NativeELK().layout(structuredClone(input) as ElkNode);
const child = (graph: ElkNode, suffix: string) =>
  graph.children!.find((node) => String(node.id).endsWith(suffix))!;
const port = (node: ElkNode, suffix: string) =>
  node.ports!.find((candidate) => String(candidate.id).includes(suffix))!;

// Real elkjs 0.11.1: 0 crossings, 0 overlap, 8 bends, length 999.78.
it("routes the feedback form no worse than ELK", async () => {
  const metrics = score(await layout(vizFeedbackForm), vizFeedbackForm as ElkNode);
  expect(hard(metrics)).toEqual(clean);
  expect(metrics.edgeCrossings).toBe(0);
  expect(metrics.edgeOverlapLength).toBe(0);
  expect(metrics.bends).toBeLessThanOrEqual(8);
  expect(metrics.routeLength).toBeLessThanOrEqual(999.78);
});

// Real elkjs 0.11.1: 4 crossings, 0 overlap, 30 bends. Before: 14 crossings,
// 160 overlap, because ports were placed in authored order rather than the
// order crossing minimization chose for them.
it("places the email drafter's fixed-side ports in swept order", async () => {
  const result = await layout(emailDrafter);
  const metrics = score(result, emailDrafter as ElkNode);
  expect(hard(metrics)).toEqual(clean);
  expect(metrics.edgeCrossings).toBeLessThanOrEqual(6);
  expect(metrics.edgeOverlapLength).toBe(0);
  // ELK's port orders: east-side invoke exits and north-side entries.
  const evaluating = child(result, "evaluating");
  const ys = ["error-0__src", "done-0__src", "done-1__src"].map(
    (id) => port(evaluating, `evaluatePrompt-${id}`).y!,
  );
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  const drafting = child(result, "drafting");
  const xs = ["REQUEST_CHANGES-0__tgt", "DRAFT_ANYWAY-0__tgt", "evaluatePrompt-done-0__tgt"].map(
    (id) => port(drafting, id).x!,
  );
  expect(xs).toEqual([...xs].sort((a, b) => a - b));
});

// Two labeled parallel edges must not drag their endpoints away from BK's
// placement when other nodes share the layer. ELK: Coordinator (67.6, 12),
// Testing (12, 266), Notifier (382, 226).
it("keeps BK placement for parallel labeled edges with other neighbors", async () => {
  const result = await layout(systemRoutingLanes);
  expect(hard(score(result, systemRoutingLanes as ElkNode))).toEqual(clean);
  for (const [id, x, y] of [
    ["Coordinator", 67.558, 12],
    ["Testing", 12, 266],
    ["Notifier", 382, 226],
  ] as const) {
    const node = child(result, id);
    expect(node.x).toBeCloseTo(x, 2);
    expect(node.y).toBeCloseTo(y, 2);
  }
});
