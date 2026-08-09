/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testOptions.js at tag 0.11.1.
 * Copyright (c) 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: layout options", () => {
  it("applies global spacing without overriding graph options", async () => {
    const elk = new ELK();
    const result = await elk.layout(
      {
        id: "root",
        layoutOptions: { "elk.direction": "RIGHT" },
        children: [
          { id: "n1", width: 10, height: 10 },
          { id: "n2", width: 10, height: 10 },
        ],
        edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
      },
      {
        layoutOptions: {
          "org.eclipse.elk.direction": "DOWN",
          "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": 11,
        },
      },
    );

    expect(result.children?.[0]?.y).toBe(result.children?.[1]?.y);
    expect(Math.abs((result.children?.[0]?.x ?? 0) - (result.children?.[1]?.x ?? 0))).toBe(21);
  });

  it("applies constructor default layout options", async () => {
    const elk = new ELK({
      defaultLayoutOptions: {
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": 33,
      },
    });
    const result = await elk.layout({
      id: "root",
      children: [
        { id: "n1", width: 10, height: 10 },
        { id: "n2", width: 10, height: 10 },
      ],
      edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
    });

    expect(Math.abs((result.children?.[0]?.x ?? 0) - (result.children?.[1]?.x ?? 0))).toBe(43);
  });

  it("rejects an unknown layout algorithm", async () => {
    const elk = new ELK();

    await expect(
      elk.layout({
        id: "root",
        layoutOptions: { algorithm: "foo.bar.baz" },
      }),
    ).rejects.toThrow("org.eclipse.elk.core.UnsupportedConfigurationException");
  });

  it("parses ELK padding and sizes the root", async () => {
    const elk = new ELK();
    const result = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.padding": "[left=2, top=3, right=3, bottom=2]",
      },
      children: [{ id: "n1", width: 10, height: 10 }],
    });

    expect(result.children?.[0]?.x).toBe(2);
    expect(result.children?.[0]?.y).toBe(3);
    expect(result.width).toBe(15);
    expect(result.height).toBe(15);
  });

  it("parses fixed positions and bend points", async () => {
    const elk = new ELK();
    const result = await elk.layout(
      {
        id: "root",
        children: [
          {
            id: "n1",
            width: 10,
            height: 10,
            layoutOptions: { position: "(23, 43)" },
          },
          { id: "n2", width: 10, height: 10 },
        ],
        edges: [
          {
            id: "e1",
            sources: ["n1"],
            targets: ["n2"],
            layoutOptions: { bendPoints: "( {1,2}, {3,4} )" },
          },
        ],
      },
      { layoutOptions: { algorithm: "fixed" } },
    );

    expect(result.children?.[0]?.x).toBe(23);
    expect(result.children?.[0]?.y).toBe(43);
    expect(result.edges?.[0]?.sections?.[0]?.startPoint).toEqual({ x: 1, y: 2 });
    expect(result.edges?.[0]?.sections?.[0]?.endPoint).toEqual({ x: 3, y: 4 });
  });
});
