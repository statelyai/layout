/** Development-only phase observations for differential tracing against real ELK. */
export type LayeredTraceEvent =
  | {
      kind: "sweep";
      scope: string;
      attempt: number;
      forward: boolean;
      firstSweep: boolean;
      crossings: number;
      layers: readonly (readonly string[])[];
    }
  | {
      kind: "port-lists";
      scope: string;
      ports: ReadonlyMap<
        string,
        readonly { name?: string; outgoing: readonly string[]; incoming: readonly string[] }[]
      >;
    }
  | {
      kind: "initial-order";
      scope: string;
      layers: readonly (readonly string[])[];
    }
  | {
      kind: "crossing-order";
      scope: string;
      edgeIds: readonly string[];
      reversedEdgeIds: readonly string[];
      layerByNodeId: ReadonlyMap<string, number>;
      layers: readonly (readonly string[])[];
    };

let observer: ((event: LayeredTraceEvent) => void) | undefined;

/** Install an observer and return the previous one. Production code never sets one. */
export function setLayeredTraceObserver(
  next: ((event: LayeredTraceEvent) => void) | undefined,
): ((event: LayeredTraceEvent) => void) | undefined {
  const previous = observer;
  observer = next;
  return previous;
}

/** Build and emit an event only while an observer is installed. */
export function traceLayeredPhase(event: () => LayeredTraceEvent): void {
  observer?.(event());
}
