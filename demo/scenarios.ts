export type DemoAlgorithm =
  | "box"
  | "fixed"
  | "force"
  | "layered"
  | "mrtree"
  | "radial"
  | "random"
  | "rectpacking"
  | "sporeCompaction"
  | "sporeOverlap"
  | "stress";

export interface DemoNodeSpec {
  id: string;
  label?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: DemoNodeSpec[];
  edges?: DemoEdgeSpec[];
}

export interface DemoEdgeSpec {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  algorithm: DemoAlgorithm;
  engine: "native" | "elkjs-oracle";
  nodes: DemoNodeSpec[];
  edges: DemoEdgeSpec[];
  options?: Record<string, string | number>;
}

const variableCards: DemoNodeSpec[] = [
  { id: "auth", label: "Authentication", width: 150, height: 72 },
  { id: "api", label: "Public API", width: 110, height: 64 },
  { id: "worker", label: "Worker pool", width: 132, height: 88 },
  { id: "cache", label: "Cache", width: 90, height: 58 },
  { id: "database", label: "Database", width: 124, height: 74 },
  { id: "events", label: "Event stream", width: 142, height: 66 },
  { id: "metrics", label: "Metrics", width: 96, height: 54 },
];

const variableCardEdges: DemoEdgeSpec[] = variableCards.slice(1).map((node, index) => ({
  id: `next-${index + 1}`,
  sourceId: variableCards[index]!.id,
  targetId: node.id,
}));

const treeEdges: DemoEdgeSpec[] = [
  { id: "root-a", sourceId: "root-state", targetId: "a" },
  { id: "root-b", sourceId: "root-state", targetId: "b" },
  { id: "a-c", sourceId: "a", targetId: "c" },
  { id: "a-d", sourceId: "a", targetId: "d" },
  { id: "b-e", sourceId: "b", targetId: "e" },
  { id: "b-f", sourceId: "b", targetId: "f" },
];

const treeNodes: DemoNodeSpec[] = ["root-state", "a", "b", "c", "d", "e", "f"].map((id) => ({
  id,
  label: id === "root-state" ? "Root" : id.toUpperCase(),
  width: 92,
  height: 56,
}));

export const demoScenarios: readonly DemoScenario[] = [
  {
    id: "layered-diamond",
    name: "Layered · diamond",
    description: "Branch and join baseline with orthogonal routes.",
    algorithm: "layered",
    engine: "native",
    nodes: ["start", "review", "revise", "done"].map((id) => ({ id, width: 112, height: 60 })),
    edges: [
      { id: "submit", sourceId: "start", targetId: "review" },
      { id: "changes", sourceId: "review", targetId: "revise" },
      { id: "approve", sourceId: "review", targetId: "done" },
      { id: "resubmit", sourceId: "revise", targetId: "review" },
    ],
  },
  {
    id: "layered-cycle",
    name: "Layered · cycle",
    description: "Cycle breaking, a self-loop, and deterministic routing.",
    algorithm: "layered",
    engine: "native",
    nodes: ["idle", "running", "paused", "failed"].map((id) => ({ id, width: 108, height: 58 })),
    edges: [
      { id: "start", sourceId: "idle", targetId: "running" },
      { id: "pause", sourceId: "running", targetId: "paused" },
      { id: "resume", sourceId: "paused", targetId: "running" },
      { id: "retry", sourceId: "failed", targetId: "running" },
      { id: "fail", sourceId: "running", targetId: "failed" },
      { id: "tick", sourceId: "running", targetId: "running" },
    ],
  },
  {
    id: "layered-long-edges",
    name: "Layered · long edges",
    description: "Crossings and edges spanning several ranks.",
    algorithm: "layered",
    engine: "native",
    nodes: ["source", "parse", "validate", "transform", "persist", "notify"].map((id) => ({
      id,
      width: 116,
      height: 56,
    })),
    edges: [
      { id: "parse", sourceId: "source", targetId: "parse" },
      { id: "validate", sourceId: "parse", targetId: "validate" },
      { id: "transform", sourceId: "validate", targetId: "transform" },
      { id: "persist", sourceId: "transform", targetId: "persist" },
      { id: "notify", sourceId: "persist", targetId: "notify" },
      { id: "fast-path", sourceId: "source", targetId: "persist" },
      { id: "audit", sourceId: "validate", targetId: "notify" },
    ],
  },
  {
    id: "layered-compound",
    name: "Layered · compound",
    description: "Oracle reference for nested nodes and child-to-parent routing.",
    algorithm: "layered",
    engine: "elkjs-oracle",
    nodes: [
      {
        id: "frontend",
        label: "Frontend",
        children: [
          { id: "form", label: "Form", width: 100, height: 56 },
          { id: "preview", label: "Preview", width: 100, height: 56 },
        ],
        edges: [{ id: "return", sourceId: "form", targetId: "frontend" }],
      },
      {
        id: "backend",
        label: "Backend",
        children: [
          { id: "validate", label: "Validate", width: 100, height: 56 },
          { id: "store", label: "Store", width: 100, height: 56 },
        ],
        edges: [{ id: "save", sourceId: "validate", targetId: "store" }],
      },
    ],
    edges: [{ id: "submit", sourceId: "frontend", targetId: "backend" }],
    options: { "elk.hierarchyHandling": "INCLUDE_CHILDREN" },
  },
  {
    id: "fixed-authored",
    name: "Fixed · authored",
    description: "Preserves authored geometry and completes routes.",
    algorithm: "fixed",
    engine: "native",
    nodes: [
      { id: "one", x: 20, y: 30, width: 110, height: 60 },
      { id: "two", x: 250, y: 80, width: 120, height: 68 },
      { id: "three", x: 110, y: 220, width: 130, height: 62 },
    ],
    edges: [
      { id: "one-two", sourceId: "one", targetId: "two" },
      { id: "two-three", sourceId: "two", targetId: "three" },
    ],
  },
  {
    id: "rectangle-packing",
    name: "Rectangle packing",
    description: "Variable-size cards packed into deterministic shelves.",
    algorithm: "rectpacking",
    engine: "native",
    nodes: variableCards,
    edges: variableCardEdges,
  },
  {
    id: "spore-compaction",
    name: "SPOrE · compaction",
    description: "Compacts sparse authored positions while preserving directions.",
    algorithm: "sporeCompaction",
    engine: "native",
    nodes: variableCards
      .slice(0, 5)
      .map((node, index) => ({ ...node, x: index * 240, y: (index % 2) * 170 })),
    edges: variableCardEdges.slice(0, 4),
  },
  {
    id: "spore-overlap",
    name: "SPOrE · overlap removal",
    description: "Separates overlapping nodes without collapsing existing gaps.",
    algorithm: "sporeOverlap",
    engine: "native",
    nodes: variableCards
      .slice(0, 5)
      .map((node, index) => ({ ...node, x: index * 18, y: index * 14 })),
    edges: variableCardEdges.slice(0, 4),
  },
  {
    id: "box-grid",
    name: "Box · grid",
    description: "Java-compatible ELK Box SIMPLE packing.",
    algorithm: "box",
    engine: "native",
    nodes: variableCards,
    edges: variableCardEdges,
  },
  {
    id: "random-scatter",
    name: "Random · scatter",
    description: "Seeded Java-compatible random distribution.",
    algorithm: "random",
    engine: "native",
    nodes: variableCards,
    edges: variableCardEdges,
    options: { randomSeed: 1729 },
  },
  {
    id: "stress-mesh",
    name: "Stress · mesh",
    description: "Oracle reference for stress-minimizing undirected layout.",
    algorithm: "stress",
    engine: "elkjs-oracle",
    nodes: ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id, width: 82, height: 52 })),
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "ac", sourceId: "a", targetId: "c" },
      { id: "bd", sourceId: "b", targetId: "d" },
      { id: "ce", sourceId: "c", targetId: "e" },
      { id: "de", sourceId: "d", targetId: "e" },
      { id: "df", sourceId: "d", targetId: "f" },
      { id: "eg", sourceId: "e", targetId: "g" },
      { id: "fh", sourceId: "f", targetId: "h" },
      { id: "gh", sourceId: "g", targetId: "h" },
    ],
    options: { randomSeed: 1729 },
  },
  {
    id: "mr-tree",
    name: "Mr. Tree",
    description: "Oracle reference for multi-rooted tree layout.",
    algorithm: "mrtree",
    engine: "elkjs-oracle",
    nodes: treeNodes,
    edges: treeEdges,
  },
  {
    id: "radial-tree",
    name: "Radial · tree",
    description: "Oracle reference for concentric radial tree layout.",
    algorithm: "radial",
    engine: "elkjs-oracle",
    nodes: treeNodes,
    edges: treeEdges,
  },
  {
    id: "force-network",
    name: "Force · network",
    description: "Oracle reference for ELK's force-directed layouter.",
    algorithm: "force",
    engine: "elkjs-oracle",
    nodes: ["api", "queue", "worker-a", "worker-b", "worker-c", "db", "cache"].map((id) => ({
      id,
      width: 104,
      height: 56,
    })),
    edges: [
      { id: "api-queue", sourceId: "api", targetId: "queue" },
      { id: "queue-a", sourceId: "queue", targetId: "worker-a" },
      { id: "queue-b", sourceId: "queue", targetId: "worker-b" },
      { id: "queue-c", sourceId: "queue", targetId: "worker-c" },
      { id: "a-db", sourceId: "worker-a", targetId: "db" },
      { id: "b-db", sourceId: "worker-b", targetId: "db" },
      { id: "c-cache", sourceId: "worker-c", targetId: "cache" },
      { id: "cache-api", sourceId: "cache", targetId: "api" },
    ],
    options: { randomSeed: 1729 },
  },
] as const;
