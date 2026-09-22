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

  it("merges worker constructor defaults with call-specific options", async () => {
    const workerGraph = {
      id: "root",
      children: [
        { id: "n1", width: 10, height: 10 },
        { id: "n2", width: 10, height: 10 },
      ],
      edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
    };
    const elk = new ApiELK({
      workerFactory: () => new Worker(),
      defaultLayoutOptions: {
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "33",
      },
    });
    const result = await elk.layout(structuredClone(workerGraph), {
      layoutOptions: { "elk.layered.spacing.nodeNodeBetweenLayers": "11" },
    });

    expect(result.children?.[0]?.y).toBe(result.children?.[1]?.y);
    expect(Math.abs((result.children?.[0]?.x ?? 0) - (result.children?.[1]?.x ?? 0))).toBe(21);
    elk.terminateWorker();
  });

  it.each(["error", "messageerror"] as const)(
    "rejects every pending request after a worker %s event",
    async (eventType) => {
      type Request = { id: number; cmd: string };
      type Answer = { id: number; data?: unknown };
      const worker = {
        onmessage: null as ((event: MessageEvent<Answer>) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        onmessageerror: null as ((event: MessageEvent) => void) | null,
        layoutRequests: 0,
        postMessage(message: Request) {
          if (message.cmd === "register") {
            queueMicrotask(() =>
              this.onmessage?.({ data: { id: message.id } } as MessageEvent<Answer>),
            );
            return;
          }
          this.layoutRequests++;
          if (this.layoutRequests !== 2) return;
          queueMicrotask(() => {
            if (eventType === "error") {
              this.onerror?.({ error: new Error("worker failed") } as ErrorEvent);
            } else {
              this.onmessageerror?.({ data: new Error("worker failed") } as MessageEvent);
            }
          });
        },
        terminate() {},
      };
      const elk = new ApiELK({ workerFactory: () => worker as unknown as globalThis.Worker });
      const first = elk.layout(structuredClone(graph));
      const second = elk.layout(structuredClone(graph));

      await expect(first).rejects.toThrow("worker failed");
      await expect(second).rejects.toThrow("worker failed");
      await expect(elk.layout(structuredClone(graph))).rejects.toThrow("worker failed");
    },
  );
});
