export type ElkId = string | number;

export interface ElkGraphElement {
  id?: ElkId;
  layoutOptions?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

export interface ElkPoint {
  x: number;
  y: number;
}

export interface ElkShape extends ElkGraphElement {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ElkLabel extends ElkShape {
  text?: string;
}

export interface ElkPort extends ElkShape {}

export interface ElkEdgeSection extends ElkGraphElement {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}

export interface ElkEdge extends ElkGraphElement {
  sources?: ElkId[];
  targets?: ElkId[];
  source?: ElkId;
  target?: ElkId;
  sourcePort?: ElkId;
  targetPort?: ElkId;
  labels?: ElkLabel[];
  sections?: ElkEdgeSection[];
}

export interface ElkNode extends ElkShape {
  labels?: ElkLabel[];
  ports?: ElkPort[];
  children?: ElkNode[];
  edges?: ElkEdge[];
  logging?: ElkLogging;
}

export interface ElkLogging {
  name?: string;
  executionTime?: number;
  logs?: string[];
  children?: ElkLogging[];
}

export interface ElkLayoutArguments {
  layoutOptions?: Record<string, unknown>;
  logging?: boolean;
  measureExecutionTime?: boolean;
}

export interface ElkConstructorArguments {
  defaultLayoutOptions?: Record<string, unknown>;
  algorithms?: string[];
  workerUrl?: string;
  workerFactory?: (url?: string) => unknown;
}

export interface ElkCommonDescription {
  id?: string;
  name?: string;
  description?: string;
}

export interface ElkLayoutAlgorithmDescription extends ElkCommonDescription {
  category?: string;
  knownOptions?: string[];
  supportedFeatures?: string[];
}

export interface ElkLayoutOptionDescription extends ElkCommonDescription {
  group?: string;
  type?: string;
  targets?: string[];
}

export interface ElkLayoutCategoryDescription extends ElkCommonDescription {
  knownLayouters?: string[];
}

export type LaidOutElkNode<T extends ElkNode> = Omit<T, "children" | "edges"> &
  Omit<ElkNode, "children" | "edges"> & {
    children?: Array<NonNullable<T["children"]>[number] & ElkNode>;
    edges?: Array<NonNullable<T["edges"]>[number] & ElkEdge>;
  };
