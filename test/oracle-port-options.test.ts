import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode, type ElkPort } from "../src/elkjs";

function expectPortGeometry(actual: ElkNode, expected: ElkNode) {
  const expectedNode = expected.children?.[0];
  const actualNode = actual.children?.[0];
  expect(actualNode?.x).toBeCloseTo(expectedNode?.x ?? Number.NaN, 12);
  expect(actualNode?.y).toBeCloseTo(expectedNode?.y ?? Number.NaN, 12);
  expect(actualNode?.width).toBeCloseTo(expectedNode?.width ?? Number.NaN, 12);
  expect(actualNode?.height).toBeCloseTo(expectedNode?.height ?? Number.NaN, 12);
  for (const expectedPort of expectedNode?.ports ?? []) {
    const actualPort = actualNode?.ports?.find(
      (candidate) => String(candidate.id) === String(expectedPort.id),
    );
    expect(actualPort, String(expectedPort.id)).toBeDefined();
    for (const property of ["x", "y", "width", "height"] as const) {
      expect(actualPort?.[property], `${String(expectedPort.id)}.${property}`).toBeCloseTo(
        expectedPort[property] ?? Number.NaN,
        12,
      );
    }
  }
}

async function compare(graph: ElkNode) {
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
  expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
  expectPortGeometry(actual, expected);
}

function port(
  id: string,
  side: "NORTH" | "SOUTH" | "WEST" | "EAST",
  options: Readonly<Record<string, string>> = {},
): ElkPort {
  return {
    id,
    width: 8,
    height: 8,
    layoutOptions: { "elk.port.side": side, ...options },
  };
}

describe("ELK port-option parity", () => {
  for (const allow of [false, true]) {
    it(`matches non-flow port side switching ${allow}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
        },
        children: [
          {
            id: "source",
            width: 40,
            height: 40,
            layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
            ports: [
              port("p", "NORTH", {
                "elk.layered.allowNonFlowPortsToSwitchSides": String(allow),
              }),
            ],
          },
          { id: "other", width: 20, height: 20 },
          { id: "target", width: 20, height: 20 },
        ],
        edges: [
          { id: "port-edge", sources: ["p"], targets: ["target"] },
          { id: "other-edge", sources: ["other"], targets: ["target"] },
        ],
      };
      const expected = (await new OracleELK().layout(
        structuredClone(graph) as never,
      )) as unknown as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.children?.[0]?.ports?.[0]?.y).toEqual(expected.children?.[0]?.ports?.[0]?.y);
    });
  }

  it("matches additional surrounding space for horizontal-side ports", async () => {
    await compare({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.spacing.portsSurrounding": "[top=20,right=30,bottom=10,left=15]",
      },
      children: [
        {
          id: "node",
          width: 100,
          height: 100,
          layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
          ports: [port("n0", "NORTH"), port("n1", "NORTH")],
        },
      ],
    });
  });

  for (const constraints of [
    "UNDEFINED",
    "FREE",
    "FIXED_SIDE",
    "FIXED_ORDER",
    "FIXED_RATIO",
    "FIXED_POS",
  ] as const) {
    it(`matches ${constraints} port constraints`, async () => {
      await compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
        },
        children: [
          {
            id: "source",
            width: 100,
            height: 80,
            layoutOptions: { "elk.portConstraints": constraints },
            ports: [
              {
                ...port("p0", "NORTH", { "elk.port.index": "1" }),
                x: 17,
                y: 23,
              },
              {
                ...port("p1", "SOUTH", { "elk.port.index": "0" }),
                x: 71,
                y: 41,
              },
            ],
          },
        ],
      });
    });
  }

  it("preserves an authored fixed position when the port side is undefined", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 100,
          height: 80,
          layoutOptions: { "elk.portConstraints": "FIXED_POS" },
          ports: [{ id: "p", x: 17, y: 23, width: 8, height: 8 }],
        },
      ],
    });
  });

  for (const side of ["NORTH", "SOUTH", "WEST", "EAST"] as const) {
    it(`matches a fixed ${side} port`, async () => {
      await compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            width: 100,
            height: 60,
            layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
            ports: [port("p", side)],
          },
        ],
      });
    });
  }

  for (const borderOffset of [-4, 5]) {
    it(`matches port border offset ${borderOffset}`, async () => {
      await compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            width: 100,
            height: 60,
            layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
            ports: [port("p", "EAST", { "elk.port.borderOffset": String(borderOffset) })],
          },
        ],
      });
    });
  }

  for (const alignment of ["BEGIN", "CENTER", "END", "JUSTIFIED"] as const) {
    it(`matches ${alignment} side alignment`, async () => {
      await compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            width: 100,
            height: 80,
            layoutOptions: {
              "elk.portConstraints": "FIXED_ORDER",
              "elk.portAlignment.east": alignment,
            },
            ports: [port("p0", "EAST"), port("p1", "EAST"), port("p2", "EAST")],
          },
        ],
      });
    });
  }

  it("matches explicit port indexes", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 100,
          height: 80,
          layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
          ports: [
            port("p0", "EAST", { "elk.port.index": "2" }),
            port("p1", "EAST", { "elk.port.index": "0" }),
            port("p2", "EAST", { "elk.port.index": "1" }),
          ],
        },
      ],
    });
  });

  it("matches reversed input order on west and south sides", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 100,
          height: 100,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            port("w0", "WEST"),
            port("w1", "WEST"),
            port("w2", "WEST"),
            port("s0", "SOUTH"),
            port("s1", "SOUTH"),
            port("s2", "SOUTH"),
          ],
        },
      ],
    });
  });

  for (const strategy of ["INPUT_ORDER", "PORT_DEGREE"] as const) {
    it(`matches ${strategy} port sorting`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.crossingMinimization.strategy": "NONE",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
          "elk.layered.portSortingStrategy": strategy,
        },
        children: [
          {
            id: "source",
            width: 80,
            height: 100,
            layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
            ports: [port("p0", "EAST"), port("p1", "EAST"), port("p2", "EAST")],
          },
          ...Array.from({ length: 6 }, (_, index) => ({
            id: `t${index}`,
            width: 20,
            height: 20,
          })),
        ],
        edges: [
          ["p0", "t0"],
          ["p1", "t1"],
          ["p1", "t2"],
          ["p1", "t3"],
          ["p2", "t4"],
          ["p2", "t5"],
        ].map(([source, target], index) => ({
          id: `degree-${index}`,
          sources: [source!],
          targets: [target!],
        })),
      };
      const expected = (await new OracleELK().layout(
        structuredClone(graph) as never,
      )) as unknown as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.children?.[0]?.ports?.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
        expected.children?.[0]?.ports?.map(({ id, x, y }) => ({ id, x, y })),
      );
    });
  }

  it("matches port anchors, protrusion spacing, and edge endpoints", async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "source",
          width: 40,
          height: 30,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [port("sourcePort", "EAST", { "elk.port.anchor": "(2,4)" })],
        },
        {
          id: "target",
          width: 40,
          height: 30,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [port("targetPort", "WEST", { "elk.port.anchor": "(6,4)" })],
        },
      ],
      edges: [{ id: "edge", sources: ["sourcePort"], targets: ["targetPort"] }],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expectPortGeometry(actual, expected);
    const expectedSection = expected.edges?.[0]?.sections?.[0];
    const actualSection = actual.edges?.[0]?.sections?.[0];
    expect(actualSection?.startPoint).toEqual(expectedSection?.startPoint);
    expect(actualSection?.endPoint).toEqual(expectedSection?.endPoint);
  });
});
