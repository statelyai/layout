/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testParameters.js at tag 0.11.1.
 * Copyright (c) 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: parameters", () => {
  it("rejects a missing graph", async () => {
    const elk = new ELK();

    await expect(elk.layout(undefined as never)).rejects.toThrow();
  });
});
