import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const side of ["EAST", "WEST", "NORTH", "SOUTH"] as const) {
  for (const placement of ["INSIDE", "OUTSIDE"] as const) {
    it(`matches ELK ${side} ${placement} port-label placement`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.spacing.labelPortHorizontal": "3",
          "elk.spacing.labelPortVertical": "4",
        },
        children: [
          {
            id: "node",
            width: 60,
            height: 40,
            layoutOptions: {
              "elk.portConstraints": "FIXED_SIDE",
              "elk.portLabels.placement": placement,
            },
            ports: [
              {
                id: "port",
                width: 6,
                height: 6,
                layoutOptions: { "elk.port.side": side },
                labels: [{ id: "label", text: "port", width: 20, height: 10 }],
              },
            ],
          },
        ],
      };
      const expected = (await new OracleELK().layout(
        structuredClone(graph) as never,
      )) as unknown as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      const expectedPort = expected.children?.[0]?.ports?.[0];
      const actualPort = actual.children?.[0]?.ports?.[0];
      expect(actualPort?.labels?.map((label) => [label.x, label.y])).toEqual(
        expectedPort?.labels?.map((label) => [label.x, label.y]),
      );
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
      expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
        expected.children?.map((node) => [node.x, node.y]),
      );
    });
  }
}

for (const placement of ["INSIDE", "OUTSIDE"] as const) {
  for (const treatAsGroup of [false, true]) {
    it(`matches ELK stacked ${placement} port labels with treatAsGroup=${treatAsGroup}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: { "elk.algorithm": "layered", "elk.spacing.labelLabel": "3" },
        children: [
          {
            id: "node",
            width: 60,
            height: 40,
            layoutOptions: {
              "elk.portConstraints": "FIXED_SIDE",
              "elk.portLabels.placement": placement,
              "elk.portLabels.nextToPortIfPossible": "true",
              "elk.portLabels.treatAsGroup": String(treatAsGroup),
            },
            ports: [
              {
                id: "port",
                width: 6,
                height: 6,
                layoutOptions: { "elk.port.side": "EAST" },
                labels: [
                  { id: "first", text: "first", width: 20, height: 10 },
                  { id: "second", text: "second", width: 30, height: 8 },
                ],
              },
            ],
          },
        ],
      };
      const expected = (await new OracleELK().layout(
        structuredClone(graph) as never,
      )) as unknown as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.children?.[0]?.ports?.[0]?.labels?.map((label) => [label.x, label.y])).toEqual(
        expected.children?.[0]?.ports?.[0]?.labels?.map((label) => [label.x, label.y]),
      );
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    });
  }
}
