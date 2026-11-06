import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { routeEdges } from "../src/routing";

it.each([undefined, { kind: "automatic" as const }])(
  "keeps midpoint label faces within allowed sides with tangent %j",
  (tangent) => {
    const graph = createGraph({
      nodes: [
        { id: "s", x: 0, y: 0, width: 100, height: 60 },
        { id: "t", x: 400, y: 0, width: 100, height: 60 },
      ],
      edges: [{ id: "e", sourceId: "s", targetId: "t", x: 550, y: 100, width: 80, height: 40 }],
    });
    const route = routeEdges({
      graph,
      settings: {
        policy: {
          path: { kind: "bezier" },
          label: { kind: "gap", attachment: "side-midpoint", tangent },
        },
        edges: { e: { labelSides: ["left", "top"] } },
      },
    }).routes.get("e")!;
    expect(route.status, JSON.stringify(route.diagnostics)).toBe("routed");
    expect(route.sections[0]!.toSide).toBe("left");
    expect(route.sections[0]!.path.segments.at(-1)!.to).toEqual({ x: 550, y: 120 });
    expect(route.sections[1]!.fromSide).toBe("top");
    expect(route.sections[1]!.path.start).toEqual({ x: 590, y: 100 });
  },
);
