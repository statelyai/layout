/*
 * Copyright (c) 2011, 2020 Kiel University and others.
 * Native adaptation of ELK LGraphUtil.createExternalPortDummy, elkjs 0.11.1.
 * SPDX-License-Identifier: EPL-2.0
 */
import type { Point } from "@statelyai/graph";

export type ExternalPortSide = "WEST" | "EAST" | "NORTH" | "SOUTH";
export type ExternalPortConstraints =
  | "UNDEFINED"
  | "FREE"
  | "FIXED_SIDE"
  | "FIXED_ORDER"
  | "FIXED_RATIO"
  | "FIXED_POS";
export interface ExternalPortDummyInput {
  constraints: ExternalPortConstraints;
  side: ExternalPortSide;
  direction: "RIGHT" | "LEFT" | "DOWN" | "UP";
  netFlow: number;
  borderOffset: number;
  size: { width: number; height: number };
  ownerSize?: { width: number; height: number };
  position?: Point;
  anchor?: Point;
  index?: number;
}
export interface ExternalPortDummy {
  type: "EXTERNAL_PORT";
  /** Parent-scope port identity for a reused compound endpoint. */
  parentPortId?: string;
  constraints: "FIXED_POS";
  side: ExternalPortSide;
  borderOffset: number;
  externalSize: { width: number; height: number };
  width: number;
  height: number;
  port: { side: ExternalPortSide; x: number; y: number };
  anchor: Point;
  layerConstraint?: "FIRST_SEPARATE" | "LAST_SEPARATE";
  edgeConstraint?: "OUTGOING_ONLY" | "INCOMING_ONLY";
  inLayerConstraint?: "TOP" | "BOTTOM";
  ratioOrPosition?: number;
}
const opposite: Record<ExternalPortSide, ExternalPortSide> = {
  WEST: "EAST",
  EAST: "WEST",
  NORTH: "SOUTH",
  SOUTH: "NORTH",
};

/** Preserve the upstream pre-direction-transform external boundary representation. */
export function createExternalPortDummy(input: ExternalPortDummyInput): ExternalPortDummy {
  const forward = ({ RIGHT: "EAST", LEFT: "WEST", DOWN: "SOUTH", UP: "NORTH" } as const)[
    input.direction
  ];
  const side =
    input.constraints === "FREE" || input.constraints === "UNDEFINED"
      ? input.netFlow >= 0
        ? forward
        : opposite[forward]
      : input.side;
  const anchor = input.anchor
    ? { ...input.anchor }
    : { x: input.size.width / 2, y: input.size.height / 2 };
  const result: ExternalPortDummy = {
    type: "EXTERNAL_PORT",
    constraints: "FIXED_POS",
    side,
    borderOffset: input.borderOffset,
    externalSize: { ...input.size },
    width: 0,
    height: 0,
    port: { side: opposite[side], x: 0, y: 0 },
    anchor,
  };
  const depth = input.borderOffset < 0 ? -input.borderOffset : 0;
  switch (side) {
    case "WEST":
      result.layerConstraint = "FIRST_SEPARATE";
      result.edgeConstraint = "OUTGOING_ONLY";
      result.height = input.size.height;
      result.width = depth;
      if (!input.anchor) anchor.x = input.size.width;
      anchor.x -= input.size.width;
      break;
    case "EAST":
      result.layerConstraint = "LAST_SEPARATE";
      result.edgeConstraint = "INCOMING_ONLY";
      result.height = input.size.height;
      result.width = depth;
      if (!input.anchor) anchor.x = 0;
      break;
    case "NORTH":
      result.inLayerConstraint = "TOP";
      result.width = input.size.width;
      result.height = depth;
      if (!input.anchor) anchor.y = input.size.height;
      anchor.y -= input.size.height;
      break;
    case "SOUTH":
      result.inLayerConstraint = "BOTTOM";
      result.width = input.size.width;
      result.height = depth;
      if (!input.anchor) anchor.y = 0;
      break;
  }
  result.port.x = anchor.x;
  result.port.y = anchor.y;
  if (
    input.constraints === "FIXED_ORDER" ||
    input.constraints === "FIXED_RATIO" ||
    input.constraints === "FIXED_POS"
  ) {
    let information = 0;
    if (input.constraints === "FIXED_ORDER" && input.index !== undefined) {
      information = side === "NORTH" || side === "EAST" ? input.index : -input.index;
    } else {
      const horizontalSide = side === "WEST" || side === "EAST";
      information = horizontalSide ? input.position!.y : input.position!.x;
      if (input.constraints === "FIXED_RATIO")
        information /= horizontalSide ? input.ownerSize!.height : input.ownerSize!.width;
    }
    result.ratioOrPosition = information;
  }
  return result;
}

// Symbols survive native phase object spreads without becoming public JSON fields.
const externalPortDummyOrigin = Symbol("externalPortDummyOrigin");
export function attachExternalPortDummy<T extends object>(node: T, origin: ExternalPortDummy): T {
  Object.defineProperty(node, externalPortDummyOrigin, { value: origin, enumerable: true });
  return node;
}
export function externalPortDummyOf(node: object): ExternalPortDummy | undefined {
  return (node as { [externalPortDummyOrigin]?: ExternalPortDummy })[externalPortDummyOrigin];
}
