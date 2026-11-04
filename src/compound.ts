import type { EntityRect } from "@statelyai/graph";
import type { LayoutDirection } from "./types";

export interface NodeSize {
  width: number;
  height: number;
}

export interface LayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Geometry reserved while laying out a compound, before its ancestors. */
export interface CompoundLayoutOptions {
  padding?: number | Partial<LayoutPadding>;
  direction?: LayoutDirection;
  header?: NodeSize & { side?: "top" | "right" | "bottom" | "left" };
  minContentSize?: Partial<NodeSize>;
}

export interface CompoundLayoutGeometry {
  /** Parent-relative outer rectangle; header/content are relative to this rectangle. */
  bounds: EntityRect;
  header?: EntityRect;
  content: EntityRect;
}

export interface CompoundEdgeAttachment {
  /** Content attachments leave toward the interior; outer attachments leave outward. */
  source?: "content" | "outer";
  target?: "content" | "outer";
}
