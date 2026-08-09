/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testIds.js at tag 0.11.1.
 * Copyright (c) 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: IDs", () => {
  it.each(["x", 2])("accepts a string or integer graph id: %j", async (id) => {
    const elk = new ELK();

    await expect(elk.layout({ id })).resolves.toMatchObject({ id });
  });

  it.each([undefined, 1.2, [], {}, true])("rejects an invalid graph id: %j", async (id) => {
    const elk = new ELK();

    await expect(elk.layout({ id } as never)).rejects.toThrow();
  });
});
