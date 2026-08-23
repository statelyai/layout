import type { LayoutResult } from "../src";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createDeepCompoundFixture,
  createLayeredDagFixture,
  createLinearFixture,
} from "./fixtures";

interface Measurement {
  durationMs: number;
  phases: Readonly<Record<string, number>>;
}

interface PerformanceCase {
  name: string;
  description: string;
  budgetMs: number;
  routingBudgetMs?: number;
  run(): Promise<LayoutResult>;
}

const linear = createLinearFixture(5_000);
const chainSmall = createLinearFixture(1_000);
const chain = createLinearFixture(5_000);
const routing = createLayeredDagFixture(12, 20, true);
const deepCompoundSmall = createDeepCompoundFixture(1_000);
const deepCompound = createDeepCompoundFixture(10_000);

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const modulePath = valueAfter("--module");
const layoutModule = modulePath
  ? ((await import(pathToFileURL(resolve(modulePath)).href)) as typeof import("../src"))
  : await import("../src");
const { getLayout } = layoutModule;

const cases: readonly PerformanceCase[] = [
  ...(["fixed", "box", "random", "rectpacking", "sporeCompaction", "sporeOverlap"] as const).map(
    (algorithm): PerformanceCase => ({
      name: `${algorithm}-5000`,
      description: `${algorithm} on 5,000 nodes and 4,999 edges`,
      budgetMs: 150,
      run: () =>
        getLayout({
          graph: linear,
          algorithm,
          ...(algorithm === "random" ? { options: { seed: 1 } } : {}),
        }),
    }),
  ),
  {
    name: "layered-chain-1000",
    description: "layered layout on a 1,000-node chain",
    budgetMs: 200,
    routingBudgetMs: 50,
    run: () => getLayout({ graph: chainSmall, algorithm: "layered" }),
  },
  {
    name: "layered-chain-5000",
    description: "layered layout on a 5,000-node chain",
    budgetMs: 750,
    routingBudgetMs: 150,
    run: () => getLayout({ graph: chain, algorithm: "layered" }),
  },
  ...(["ORTHOGONAL", "POLYLINE", "SPLINES"] as const).map((edgeRouting): PerformanceCase => ({
    name: `routing-${edgeRouting.toLowerCase()}-240`,
    description: `${edgeRouting.toLowerCase()} routing on a 240-node long-edge DAG`,
    budgetMs: 600,
    routingBudgetMs: 100,
    run: () =>
      getLayout({
        graph: routing,
        algorithm: "layered",
        options: { settings: { edgeRouting } },
      }),
  })),
  {
    name: "layered-deep-compound-1000",
    description: "layered layout on 1,000 recursively nested nodes",
    budgetMs: 30,
    run: () => getLayout({ graph: deepCompoundSmall, algorithm: "layered" }),
  },
  {
    name: "layered-deep-compound-10000",
    description: "layered layout on 10,000 recursively nested nodes",
    budgetMs: 150,
    run: () => getLayout({ graph: deepCompound, algorithm: "layered" }),
  },
];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function summarize(values: readonly number[]) {
  const center = median(values);
  return {
    median: center,
    mad: median(values.map((value) => Math.abs(value - center))),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

function toMeasurement(result: LayoutResult): Measurement {
  return {
    durationMs: result.metrics.durationMs,
    phases: Object.fromEntries(result.metrics.phases.map((phase) => [phase.id, phase.durationMs])),
  };
}

const sampleCount = Math.max(1, Number(valueAfter("--samples") ?? 5));
const filter = valueAfter("--case");
const check = process.argv.includes("--check");
const selected = filter ? cases.filter((entry) => entry.name.includes(filter)) : cases;

if (selected.length === 0) throw new Error(`No benchmark case matches ${String(filter)}`);

console.log(`Warmup: 2; samples: ${sampleCount}`);
console.log("| Case | Median | MAD | Range | Routing phase | Budget |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

const failures: string[] = [];

for (const entry of selected) {
  await entry.run();
  await entry.run();
  const samples: Measurement[] = [];
  for (let sample = 0; sample < sampleCount; sample++) {
    globalThis.gc?.();
    samples.push(toMeasurement(await entry.run()));
  }
  const duration = summarize(samples.map((sample) => sample.durationMs));
  const routingPhase = samples.flatMap((sample) => {
    const value = sample.phases["edge-routing"];
    return value === undefined ? [] : [value];
  });
  const routingDuration = routingPhase.length === 0 ? undefined : median(routingPhase);
  const routingMedian = routingDuration === undefined ? "-" : `${routingDuration.toFixed(2)} ms`;
  console.log(
    `| ${entry.name} | ${duration.median.toFixed(2)} ms | ${duration.mad.toFixed(2)} ms | ${duration.minimum.toFixed(2)}-${duration.maximum.toFixed(2)} ms | ${routingMedian} | ${entry.budgetMs.toFixed(0)} ms |`,
  );
  if (duration.median > entry.budgetMs) {
    failures.push(`${entry.name}: ${duration.median.toFixed(2)} ms > ${entry.budgetMs} ms`);
  }
  if (
    routingDuration !== undefined &&
    entry.routingBudgetMs !== undefined &&
    routingDuration > entry.routingBudgetMs
  ) {
    failures.push(
      `${entry.name} routing: ${routingDuration.toFixed(2)} ms > ${entry.routingBudgetMs} ms`,
    );
  }
}

if (check && failures.length > 0) {
  throw new Error(`Performance budget exceeded:\n${failures.join("\n")}`);
}

if (modulePath) process.exit(0);
