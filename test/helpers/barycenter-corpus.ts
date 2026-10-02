import { JavaRandom } from "../../src/java-random";
import type { BarycenterOracleInput } from "./elk-constraint-oracle";
export function barycenterCorpus(): BarycenterOracleInput[] {
  const random = new JavaRandom(3468112780);
  return Array.from({ length: 512 }, (_, index) => {
    const layer = Array.from({ length: 2 + random.nextInt(5) }, (_, i) => `n${i}`);
    const visits: BarycenterOracleInput["visits"] = layer.map((id) => [
      id,
      Array.from({ length: random.nextInt(7) }, () =>
        random.nextBoolean() ? layer[random.nextInt(layer.length)]! : random.nextDouble() * 20,
      ),
    ]);
    const associates: BarycenterOracleInput["associates"] = layer.map((id, i) => [
      id,
      i + 1 < layer.length && random.nextBoolean() ? [layer[i + 1]!] : [],
    ]);
    return { layer, visits, associates, seed: random.nextInt(2 ** 30), forward: index % 2 === 0 };
  });
}
