/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testLogging.js at tag 0.11.1.
 * Copyright (c) 2019 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: logging", () => {
  it("adds requested logs and clears them on the next unlogged run", async () => {
    const elk = new ELK();
    const graph = {
      id: "root",
      children: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    };

    const logged = await elk.layout(graph, { logging: true });
    expect(logged.logging?.children).toBeDefined();
    expect(logged.logging?.executionTime).toBeUndefined();

    const timed = await elk.layout(graph, { measureExecutionTime: true });
    expect(timed.logging?.executionTime).toBeTypeOf("number");

    const plain = await elk.layout(graph);
    expect(plain.logging).toBeUndefined();
  });
});
