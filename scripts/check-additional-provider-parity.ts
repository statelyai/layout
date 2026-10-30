import { writeFile } from "node:fs/promises";
import OracleELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import oraclePackage from "elkjs/package.json" with { type: "json" };
import ELK from "../src/elkjs";

if (oraclePackage.version !== "0.11.1") {
  throw new Error(`Expected elkjs 0.11.1 oracle, received ${oraclePackage.version}`);
}
const algorithms = ["mrtree", "radial", "force", "stress"];
const fixtures: Record<string, ElkNode> = {
  empty: { id: "root", children: [], edges: [] },
  singleton: { id: "root", children: [{ id: "a", width: 120, height: 48 }], edges: [] },
  branch: {
    id: "root",
    children: ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => ({
      id,
      width: 80 + i * 7,
      height: 40 + (i % 3) * 12,
    })),
    edges: [
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["b", "e"],
      ["c", "f"],
      ["c", "g"],
    ].map(([a, b]) => ({ id: `${a}${b}`, sources: [a!], targets: [b!] })),
  },
  cyclic: {
    id: "root",
    children: ["a", "b", "c"].map((id) => ({ id, width: 80, height: 40 })),
    edges: [
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
    ].map(([a, b]) => ({ id: `${a}${b}`, sources: [a!], targets: [b!] })),
  },
  disconnected: {
    id: "root",
    children: ["a", "b", "c", "d", "e"].map((id) => ({ id, width: 80, height: 40 })),
    edges: [
      { id: "ab", sources: ["a"], targets: ["b"] },
      { id: "cd", sources: ["c"], targets: ["d"] },
    ],
  },
};
const oracle = new OracleELK();
const implementation = new ELK();
function geometry(graph: ElkNode) {
  return {
    x: graph.x,
    y: graph.y,
    width: graph.width,
    height: graph.height,
    nodes: graph.children?.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    edges: graph.edges?.map(({ id, sections }) => ({
      id,
      sections: sections?.map(({ startPoint, endPoint, bendPoints }) => ({
        startPoint,
        endPoint,
        bendPoints,
      })),
    })),
  };
}
const results = [];
for (const algorithm of algorithms)
  for (const [fixture, graph] of Object.entries(fixtures)) {
    const input: ElkNode = {
      ...structuredClone(graph),
      layoutOptions: { "elk.algorithm": algorithm, "elk.randomSeed": "7" },
    };
    const [actual, expected] = await Promise.allSettled([
      implementation.layout(structuredClone(input)),
      oracle.layout(structuredClone(input)),
    ]);
    const actualGeometry = actual.status === "fulfilled" ? geometry(actual.value) : undefined;
    const expectedGeometry = expected.status === "fulfilled" ? geometry(expected.value) : undefined;
    const match =
      (actual.status === "rejected" &&
        expected.status === "rejected" &&
        String(actual.reason) === String(expected.reason)) ||
      (actual.status === "fulfilled" &&
        expected.status === "fulfilled" &&
        JSON.stringify(actualGeometry) === JSON.stringify(expectedGeometry));
    results.push({
      algorithm,
      fixture,
      match,
      actual: actualGeometry,
      expected: expectedGeometry,
      actualError: actual.status === "rejected" ? String(actual.reason) : undefined,
      expectedError: expected.status === "rejected" ? String(expected.reason) : undefined,
    });
  }
const report = {
  oracleVersion: `elkjs ${oraclePackage.version}`,
  exactMatches: results.filter((result) => result.match).length,
  cases: results.length,
  results,
};
const output = process.argv[2];
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      exactMatches: report.exactMatches,
      cases: report.cases,
      mismatches: results
        .filter((result) => !result.match)
        .map(({ algorithm, fixture }) => ({ algorithm, fixture })),
    },
    null,
    2,
  ),
);
if (report.exactMatches !== report.cases) process.exitCode = 1;
