import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  for (const seed of [3, 9, 16, 18, 19, 21, 23, 24])
    it(`retains finite geometry for random compaction seed ${seed} in ${direction}`, async () => {
      const input = flatFixture(seed, direction);
      input.layoutOptions = {
        ...input.layoutOptions,
        "elk.layered.compaction.postCompaction.strategy": [
          "LEFT",
          "RIGHT",
          "LEFT_RIGHT_CONSTRAINT_LOCKING",
          "LEFT_RIGHT_CONNECTION_LOCKING",
        ][(seed - 1) % 4]!,
      };
      const original = structuredClone(input);
      const actual = await new Native().layout(input);
      const geometry = compoundGeometry(actual);
      const check = (value: unknown): void => {
        if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        else if (Array.isArray(value)) value.forEach(check);
        else if (value && typeof value === "object") Object.values(value).forEach(check);
      };
      check(geometry);
      expect(actual.children?.map((node) => node.id)).toEqual(
        original.children?.map((node) => node.id),
      );
      expect(actual.edges?.map((edge) => edge.id)).toEqual(original.edges?.map((edge) => edge.id));
      for (const edge of actual.edges ?? []) {
        expect(edge.sources).toEqual(
          original.edges?.find((candidate) => candidate.id === edge.id)?.sources,
        );
        expect(edge.targets).toEqual(
          original.edges?.find((candidate) => candidate.id === edge.id)?.targets,
        );
        expect(edge.sections?.length).toBeGreaterThan(0);
        for (const section of edge.sections ?? []) {
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
          for (let index = 1; index < points.length; index++)
            expect(
              Math.abs(points[index]!.x - points[index - 1]!.x) < 1e-8 ||
                Math.abs(points[index]!.y - points[index - 1]!.y) < 1e-8,
            ).toBe(true);
        }
      }
    });
