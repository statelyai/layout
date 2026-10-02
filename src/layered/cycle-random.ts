import { JavaRandom } from "../java-random";
import type { LayeredPhaseInput } from "./types";

const afterCycle = new WeakMap<LayeredPhaseInput, JavaRandom>();

export function recordCycleRandom(input: LayeredPhaseInput, random: JavaRandom): void {
  afterCycle.set(input, random.clone());
}

export function crossingRandom(input: LayeredPhaseInput): JavaRandom {
  return afterCycle.get(input)?.clone() ?? new JavaRandom(input.settings.randomSeed ?? 1);
}

export function inheritCycleRandom<T extends LayeredPhaseInput>(from: LayeredPhaseInput, to: T): T {
  const random = afterCycle.get(from);
  if (random) afterCycle.set(to, random);
  return to;
}
