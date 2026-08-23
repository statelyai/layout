import type { GraphPort } from "@statelyai/graph";

const positionByPort = new WeakMap<object, { x: number; y: number }>();

export function setFlexiblePortPosition(port: GraphPort, x: number, y: number): void {
  positionByPort.set(port, { x, y });
}

export function getFlexiblePortPosition(port: GraphPort): { x: number; y: number } | undefined {
  return positionByPort.get(port);
}
