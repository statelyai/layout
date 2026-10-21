import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import {
  bundleRouting,
  busRouting,
  fanRouting,
  routingPolicies,
  type RoutingSettings,
} from "../src/routing";

describe("preserve-valid shared routes", () => {
  it.each([bundleRouting, busRouting, fanRouting])(
    "$id keeps shared trunk geometry identical after moving one peer",
    (strategy) => {
      const input = createGraph({
        id: "shared-preservation",
        nodes: [
          { id: "a", x: 0, y: 0, width: 40, height: 40 },
          { id: "b", x: 300, y: 140, width: 40, height: 40 },
          { id: "c", x: 400, y: -140, width: 40, height: 40 },
        ],
        edges: [
          { id: "ab", sourceId: "a", targetId: "b" },
          { id: "ac", sourceId: "a", targetId: "c" },
        ],
      });
      const moved = {
        ...input,
        nodes: input.nodes.map((node) => (node.id === "b" ? { ...node, x: 500 } : node)),
      };
      const settings: RoutingSettings = {
        policy: { ...routingPolicies.diagram, stability: { kind: "preserve-valid" } },
      };
      const initial = strategy.route(input, settings);
      const updated = strategy.update(moved, initial, getDiff(input, moved)).snapshot;
      const before = initial.routes.get("ab")!.sections.find((section) => section.sharedId)!;
      const changed = updated.routes.get("ab")!;
      const unchanged = updated.routes.get("ac")!;
      const trunk = changed.sections.find((section) => section.sharedId)!;
      const peerTrunk = unchanged.sections.find((section) => section.sharedId)!;

      expect(changed.status).toBe("routed");
      expect(unchanged.status).toBe("routed");
      expect(trunk).toBeDefined();
      expect(peerTrunk).toBeDefined();
      expect(trunk.path).not.toEqual(before.path);
      expect(peerTrunk.sharedId).toBe(trunk.sharedId);
      expect(peerTrunk.path).toEqual(trunk.path);
    },
  );
});
