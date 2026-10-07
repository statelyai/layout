import type { AcyclicOrientation, LayeredPhaseInput, LayerOrder } from "./types";

const orientationByInput = new WeakMap<LayeredPhaseInput, AcyclicOrientation>();

/** Retain the active acyclic topology without altering authored endpoints or public output. */
export function setPlacementOrientation(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
): void {
  orientationByInput.set(input, orientation);
}
export function getPlacementOrientation(input: LayeredPhaseInput): AcyclicOrientation | undefined {
  return orientationByInput.get(input);
}

const orderByInput = new WeakMap<LayeredPhaseInput, LayerOrder>();
export function setPlacementOrder(input: LayeredPhaseInput, order: LayerOrder): void {
  orderByInput.set(input, order);
}
export function getPlacementOrder(input: LayeredPhaseInput): LayerOrder | undefined {
  return orderByInput.get(input);
}
