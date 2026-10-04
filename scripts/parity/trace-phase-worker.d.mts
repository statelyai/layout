import type { ElkNode } from "../../src/elkjs/types";

type Layers = string[][];

/** Lay out a copy of `input` with real ELK and return per-scope phase observations. */
export function traceElkPhases(input: ElkNode): Promise<{
  output: ElkNode;
  scopes: Array<{
    scope: number;
    edgeIds: string[];
    reversed: string[];
    portLists: Record<
      string,
      Array<{ name: string | null; outgoing: string[]; incoming: string[] }>
    >;
    layering?: Layers;
    initialOrder?: Layers;
    crossingOrder?: Layers;
  }>;
}>;
