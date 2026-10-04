import { createGraph } from "@statelyai/graph";

import { insertNorthSouthPortDummies } from "../../src/layered/north-south-ports";
import { splitLongEdges } from "../../src/layered/long-edges";
import type { LayeredPhaseInput } from "../../src/layered/types";
import type { CrossPortOracleInput } from "./elk-constraint-oracle";
export function nativeCrossPortOrder(
  data: CrossPortOracleInput,
  preprocess = insertNorthSouthPortDummies,
) {
  const ports = data.ports.map((p) => ({
    name: p.id,
    direction: "inout" as const,
    x: p.x,
    y: p.side === "NORTH" ? 0 : 60,
    width: 0,
    height: 0,
    data: p,
  }));
  const edges = data.ports
    .flatMap((p) => [
      ...(p.input
        ? [{ id: p.id + "-in", sourceId: "before", targetId: "owner", targetPort: p.id }]
        : []),
      ...(p.output
        ? [{ id: p.id + "-out", sourceId: "owner", sourcePort: p.id, targetId: "after" }]
        : []),
    ])
    .reverse();
  const graph = createGraph({
    nodes: [{ id: "before" }, { id: "owner", width: 100, height: 60, ports }, { id: "after" }],
    edges,
  });
  const input: LayeredPhaseInput = {
    graph,
    sizes: new Map(),
    direction: "right",
    settings: {},
    constrainedLayerByNodeId: new Map(),
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, right: 12, bottom: 12, left: 12 },
    nodeSettings: (n) => ({ portConstraints: n.id === "owner" ? "FIXED_POS" : "FREE" }),
    portSettings: (p) => ({ "port.side": (p.data as CrossPortOracleInput["ports"][number]).side }),
  };
  const phase = preprocess(
    splitLongEdges(
      input,
      { reversedEdgeIds: new Set() },
      {
        layerByNodeId: new Map([
          ["before", 0],
          ["owner", 1],
          ["after", 2],
        ]),
      },
    ),
  );
  const label = (id: string) => phase.originsByDummyId.get(id)?.port.name ?? id;
  return {
    order: phase.expansion.assignment
      .seedOrder!.filter((id) => phase.expansion.assignment.layerByNodeId.get(id) === 1)
      .map(label),
    associates: [...phase.originsByDummyId]
      .filter(([, o]) => o.node.id === "owner")
      .map(([id]) => label(id)),
  };
}
