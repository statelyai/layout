/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/test-bug-klay-22.js at tag 0.11.1.
 * Copyright (c) 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: node labels", () => {
  it("places labels with global and node-specific options", async () => {
    const elk = new ELK();
    const result = await elk.layout(
      {
        id: "root",
        children: [
          {
            id: "n1",
            width: 100,
            height: 100,
            labels: [{ id: "l1", text: "Label1" }],
          },
          {
            id: "n2",
            width: 100,
            height: 100,
            labels: [
              {
                id: "l2",
                text: "Label2",
                layoutOptions: {
                  "elk.nodeLabels.placement": "INSIDE V_CENTER H_CENTER",
                },
              },
            ],
          },
        ],
        edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
      },
      {
        layoutOptions: {
          "elk.nodeLabels.placement": "OUTSIDE V_TOP H_CENTER",
        },
      },
    );

    expect(result.children?.[0]?.labels?.[0]).toMatchObject({ x: 50, y: -5 });
    expect(result.children?.[1]?.labels?.[0]).toMatchObject({ x: 50, y: 50 });
  });
});
