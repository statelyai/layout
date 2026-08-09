/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/test-bug-63.js at tag 0.11.1.
 * Copyright (c) 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";
import bug7 from "../fixtures/elkjs-0.11.1/bug-7.json";
import changeAwareArrayList from "../fixtures/elkjs-0.11.1/change-aware-array-list.json";

describe("elkjs compatibility: regressions", () => {
  it("lays out the original elkjs#7 fixed-order port fixture", async () => {
    const elk = new ELK();

    await expect(elk.layout(structuredClone(bug7))).resolves.toBeDefined();
  });

  it("lays out the original ChangeAwareArrayList stress fixture", async () => {
    const elk = new ELK();

    await expect(elk.layout(structuredClone(changeAwareArrayList))).resolves.toBeDefined();
  });

  it("lays out a COFFMAN_GRAHAM graph containing a self-loop", async () => {
    const elk = new ELK();
    const result = await elk.layout({
      id: "root",
      properties: {
        algorithm: "layered",
        "layering.strategy": "COFFMAN_GRAHAM",
      },
      children: [
        { id: "n1", width: 30, height: 30 },
        { id: "n2", width: 30, height: 30 },
        { id: "n3", width: 30, height: 30 },
      ],
      edges: [
        { id: "e1", sources: ["n1"], targets: ["n2"] },
        { id: "e2", sources: ["n1"], targets: ["n3"] },
        { id: "e3", sources: ["n1"], targets: ["n1"] },
      ],
    });

    expect(result.edges?.find((edge) => edge.id === "e3")?.sections).toHaveLength(1);
  });

  it("accepts existing edge sections with unspecified bend points", async () => {
    const elk = new ELK();
    await expect(
      elk.layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
        },
        children: [
          { id: "n1", width: 10, height: 10 },
          { id: "n2", width: 10, height: 10 },
        ],
        edges: [
          { id: "e1", sources: ["n1"], targets: ["n2"] },
          {
            id: "e2",
            sources: ["n1"],
            targets: ["n2"],
            sections: [
              {
                id: "es2",
                startPoint: { x: 0, y: 0 },
                bendPoints: [{ x: 20, y: 0 }],
                endPoint: { x: 50, y: 0 },
              },
            ],
          },
        ],
      }),
    ).resolves.toBeDefined();
  });
});
