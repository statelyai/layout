import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";

it("retains the compound-options-v1 inputs, including failing seeds", () => {
  const inputs = ["RIGHT", "LEFT", "DOWN", "UP"].flatMap((direction) =>
    Array.from({ length: 20 }, (_, index) => compoundOptionsFixture(index + 1, direction)),
  );
  expect(createHash("sha256").update(JSON.stringify(inputs)).digest("hex")).toBe(
    "bedef2f9dae7627a86b019c87f0930a39effb7ec8fcc4b33067c2a4f3107667a",
  );
});
