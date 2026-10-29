import { createGraph } from "@statelyai/graph";
const nodeDescriptions = [
  "Captures the current semantic graph revision. Waits for prior work on this editor to settle; a prior rejected task does not permanently block the queue.",
  "Checks cancellation/current request, editing mode, edit capability, strict input schema and unchanged document revision before starting conversion.",
  "Converts complete XState source using the current graph profile and extensions. Built-in XState input delegates to the conversion HTTP API.",
  "Repeats request/currentness, mode/capability and graph-revision checks after asynchronous conversion. Then checks graph integrity, modeling and profile validation before replacement.",
  "Stale/cancelled requests, unavailable editing or malformed initial input return a rejection. A cancelled caller may already have returned while underlying queued work settles.",
  "A conversion or candidate-graph contract failure is reported as repairable after creation starts, with a retry-create hint.",
  "Replaces the graph, emits replacement start, requests layout for all scopes and returns success with the new graph revision.",
];
const edgeDescriptions = [
  "Previous queued work has settled; execute this action.",
  "A preflight check throws before creation begins.",
  "Preflight succeeds; mark creation as started and await conversion.",
  "A graph is returned; reassess the live editor before applying it.",
  "Conversion throws after creation starts; surface a repairable rejection.",
  "The request was cancelled/replaced, editing is unavailable or the semantic graph revision changed.",
  "Request remains current but the candidate fails graph contract checks.",
  "Request and candidate checks pass; replace the graph and request layout.",
];
const ids = [
  "Queued",
  "Checking request",
  "Converting source",
  "Checking result",
  "Rejected without applying",
  "Source or graph needs correction",
  "Applied",
];
const transitions: readonly [number, number, string][] = [
  [0, 1, "queueReady"],
  [1, 4, "IF preflightRejected"],
  [1, 2, "ELSE"],
  [2, 3, "conversionCompleted"],
  [2, 5, "conversionFailed"],
  [3, 4, "IF requestObsoleteOrUnavailable"],
  [3, 5, "ELSE IF candidateRejected"],
  [3, 6, "ELSE"],
];
export function requestGraph(descriptions = false) {
  return createGraph({
    nodes: ids.map((id, i) => ({
      id,
      label: id,
      width: descriptions ? 300 : Math.max(96, id.length * 7 + 32),
      height: descriptions ? 96 : 48,
      data: { description: descriptions ? nodeDescriptions[i] : "" },
    })),
    edges: transitions.map(([a, b, label], i) => ({
      id: `e${i}`,
      sourceId: ids[a]!,
      targetId: ids[b]!,
      label: label,
      width: descriptions ? 230 : label.length * 7,
      height: descriptions ? 64 : 20,
      data: { guard: label, description: descriptions ? edgeDescriptions[i] : "" },
    })),
  });
}
