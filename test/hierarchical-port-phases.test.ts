import { expect, it } from "vitest";
import {
  checkHierarchicalPortPhases,
  checkHierarchicalPortDirections,
} from "../scripts/check-hierarchical-port-phases";

for (const asymmetric of [false, true]) {
  it(`matches real ELK constraint, sizing and routing phases; asymmetric=${asymmetric}`, () => {
    const report = checkHierarchicalPortPhases(asymmetric);
    expect(report.cases).toBe(384);
    expect(report.failures).toEqual([]);
  }, 30000);
}

it("matches initial ELK transforms across four directions, two congruencies and four faces", () => {
  const report = checkHierarchicalPortDirections();
  expect(report.cases).toBe(32);
  expect(report.failures).toEqual([]);
});
