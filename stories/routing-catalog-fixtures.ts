import { createGraph } from "@statelyai/graph";

export function createRoutingCatalogGraph() {
  return createGraph({
    id: "routing-playground",
    nodes: [
      { id: "Start", x: 30, y: 80, width: 80, height: 44 },
      { id: "Review", x: 380, y: 40, width: 80, height: 44 },
      { id: "Publish", x: 380, y: 230, width: 80, height: 44 },
      { id: "Obstacle", x: 200, y: 60, width: 70, height: 110 },
      { id: "Independent", x: 30, y: 360, width: 100, height: 44 },
      { id: "Done", x: 380, y: 360, width: 80, height: 44 },
    ],
    edges: [
      { id: "review", sourceId: "Start", targetId: "Review" },
      {
        id: "publish",
        sourceId: "Start",
        targetId: "Publish",
        x: 210,
        y: 240,
        width: 72,
        height: 26,
      },
      { id: "parallel", sourceId: "Start", targetId: "Review" },
      { id: "loop", sourceId: "Publish", targetId: "Publish" },
      { id: "independent", sourceId: "Independent", targetId: "Done" },
    ],
  });
}

export function createRoutingCoordinationGraph() {
  return createGraph({
    id: "coordination",
    nodes: [
      { id: "Left", x: 40, y: 180, width: 80, height: 40 },
      { id: "Right", x: 480, y: 180, width: 80, height: 40 },
      { id: "Top", x: 260, y: 30, width: 80, height: 40 },
      { id: "Bottom", x: 260, y: 350, width: 80, height: 40 },
    ],
    edges: [
      { id: "a", sourceId: "Left", targetId: "Right" },
      { id: "z", sourceId: "Top", targetId: "Bottom" },
    ],
  });
}
