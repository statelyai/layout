import { expect, it } from "vitest";
import { RouteReservationIndex } from "../src/routing/coordination";
import { pathFromPoints } from "../src/routing/path";
import type { Route } from "../src/routing/types";

function route(edgeId: string, y: number): Route {
  return {
    edgeId,
    status: "routed",
    diagnostics: [],
    sections: [
      {
        id: `${edgeId}:0`,
        from: { kind: "node", nodeId: "a" },
        to: { kind: "node", nodeId: "b" },
        path: pathFromPoints([
          { x: 0, y },
          { x: 1000, y },
          { x: 1000, y: y + 1000 },
        ]),
      },
    ],
  };
}

it("queries drawn segments without reserving empty space in route envelopes", () => {
  const index = new RouteReservationIndex()
    .set("edge10", route("edge10", 0))
    .set("edge2", route("edge2", 10));
  expect(index.query({ x: 400, y: 400, width: 20, height: 20 })).toEqual([]);
  const near = index.query({ x: 400, y: -1, width: 20, height: 20 });
  expect(near.map((reservation) => [reservation.edgeId, reservation.index])).toEqual([
    ["edge10", 0],
    ["edge2", 0],
  ]);
  const moved = index.set("edge10", route("edge10", 2000));
  expect(
    moved.query({ x: 400, y: -1, width: 20, height: 20 }).map((reservation) => reservation.edgeId),
  ).toEqual(["edge2"]);
  expect(index.query({ x: 400, y: -1, width: 20, height: 20 })).toHaveLength(2);
  expect(moved.set("edge2").query({ x: 400, y: -1, width: 20, height: 20 })).toEqual([]);
});
