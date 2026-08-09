/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testRaiseException.js at tag 0.11.1.
 * Copyright (c) 2020 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: layered constraints", () => {
  it("rejects a cycle whose nodes are all constrained to the first layer", async () => {
    const elk = new ELK();
    await expect(
      elk.layout({
        id: "root",
        properties: { algorithm: "layered" },
        children: [
          { id: "n1", layoutOptions: { layerConstraint: "FIRST" } },
          { id: "n2", layoutOptions: { layerConstraint: "FIRST" } },
          { id: "n3", layoutOptions: { layerConstraint: "FIRST" } },
        ],
        edges: [
          { id: "e1", sources: ["n1"], targets: ["n2"] },
          { id: "e2", sources: ["n2"], targets: ["n3"] },
          { id: "e3", sources: ["n3"], targets: ["n1"] },
        ],
      }),
    ).rejects.toThrow("org.eclipse.elk.core.UnsupportedConfigurationException");
  });
});
