import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";

// Random model order must not override physical fixed-port order.
it("matches real ELK fixed-port fan order across random seeds and directions", async () => {
  const elk = new ELK();
  for (const direction of ["right", "left", "down", "up"] as const) {
    const horizontal = direction === "right" || direction === "left";
    const side = ({ right: "EAST", left: "WEST", down: "SOUTH", up: "NORTH" } as const)[direction];
    for (let seed = 1; seed <= 12; seed++) {
      let state = seed;
      const random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), state | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
      };
      const count = 2 + Math.floor(random() * 5);
      const permutation = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!];
      }
      const nodes = [
        {
          id: "s",
          width: horizontal ? 80 : count * 40,
          height: horizontal ? count * 40 : 80,
          ports: permutation.map((i) => ({
            name: `p${i}`,
            direction: "out" as const,
            x: horizontal ? (direction === "right" ? 80 : 0) : 20 + 40 * i,
            y: horizontal ? 20 + 40 * i : direction === "down" ? 80 : 0,
            width: 0,
            height: 0,
          })),
        },
        ...permutation.map((i) => ({ id: `n${i}`, width: 20, height: 20, ports: undefined })),
      ];
      const edges = permutation.map((i) => ({
        id: `e${i}`,
        sourceId: "s",
        sourcePort: `p${i}`,
        targetId: `n${i}`,
      }));
      const native = getLayeredLayout(createGraph({ nodes, edges }), {
        direction,
        settings: {
          randomSeed: seed,
          "layering.strategy": "LONGEST_PATH_SOURCE",
          "crossingMinimization.greedySwitch.type": "OFF",
        },
        nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
        portSettings: () => ({ "port.side": side }),
      });
      const oracle = await elk.layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": direction.toUpperCase(),
          "elk.randomSeed": String(seed),
          "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        },
        children: nodes.map((n) => ({
          ...n,
          layoutOptions: { "elk.portConstraints": "FIXED_POS" },
          ports: n.ports?.map((p) => ({
            ...p,
            id: `s:${p.name}`,
            layoutOptions: { "elk.port.side": side },
          })),
        })),
        edges: edges.map((e) => ({
          id: e.id,
          sources: [`s:${e.sourcePort}`],
          targets: [e.targetId],
        })),
      });
      const order = (ns: ReadonlyArray<{ id: string; x?: number; y?: number }>) =>
        ns
          .filter((n) => n.id !== "s")
          .sort((a, b) => (horizontal ? (a.y ?? 0) - (b.y ?? 0) : (a.x ?? 0) - (b.x ?? 0)))
          .map((n) => n.id);
      expect(order(native.nodes), `${direction} seed ${seed}`).toEqual(
        order(oracle.children ?? []),
      );
    }
  }
}, 30000);
