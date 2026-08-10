/*******************************************************************************
 * Covers the public metadata/worker API documented by kieler/elkjs 0.11.1.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: metadata API", () => {
  it("reports implemented algorithms/options and terminates idempotently", async () => {
    const elk = new ELK();

    await expect(elk.knownLayoutAlgorithms()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "org.eclipse.elk.layered", knownOptions: expect.any(Array) }),
        expect.objectContaining({ id: "fixed" }),
      ]),
    );
    await expect(elk.knownLayoutOptions()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "org.eclipse.elk.direction" })]),
    );
    const layered = (await elk.knownLayoutAlgorithms()).find(
      (algorithm) => algorithm.id === "org.eclipse.elk.layered",
    );
    expect(layered?.knownOptions).toHaveLength(152);
    await expect(elk.knownLayoutCategories()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "layered" })]),
    );
    expect(() => {
      elk.terminateWorker();
      elk.terminateWorker();
    }).not.toThrow();
  });
});
