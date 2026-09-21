/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testEntryPoints.js and test-node.js at tag 0.11.1.
 * Copyright (c) 2020-2021 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import BundledELK from "../../src/elkjs/main";
import ApiELK from "../../src/elkjs/worker-api";
import { Worker } from "../../src/elkjs/worker";

const graph = {
  id: "root",
  properties: { algorithm: "layered" },
  children: [
    { id: "n1", width: 30, height: 30 },
    { id: "n2", width: 30, height: 30 },
    { id: "n3", width: 30, height: 30 },
  ],
  edges: [
    { id: "e1", sources: ["n1"], targets: ["n2"] },
    { id: "e2", sources: ["n1"], targets: ["n3"] },
  ],
};

describe("elkjs compatibility: entry points", () => {
  it("lays out through the bundled entry point", async () => {
    await expect(new BundledELK().layout(structuredClone(graph))).resolves.toMatchObject({
      id: "root",
    });
  });

  it("lays out through the main entry point", async () => {
    await expect(new BundledELK().layout(structuredClone(graph))).resolves.toMatchObject({
      id: "root",
    });
  });

  it("lays out through the non-minified worker entry point", async () => {
    const elk = new ApiELK({ workerFactory: () => new Worker() });
    await expect(elk.layout(structuredClone(graph))).resolves.toMatchObject({ id: "root" });
    elk.terminateWorker();
  });

  it("lays out through the worker URL path", async () => {
    const elk = new BundledELK({ workerUrl: "./lib/elk-worker.js" });
    await expect(elk.layout(structuredClone(graph))).resolves.toMatchObject({ id: "root" });
    elk.terminateWorker();
  });

  it("lays out through the minified worker URL path", async () => {
    const elk = new BundledELK({ workerUrl: "./lib/elk-worker.min.js" });
    await expect(elk.layout(structuredClone(graph))).resolves.toMatchObject({ id: "root" });
    elk.terminateWorker();
  });
});
