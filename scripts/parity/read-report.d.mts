import type { ElkNode } from "../../src/elkjs/types";

/** Reconstruct complete report rows from preserved baselines and indexed updates. */
export function readReport(path: string): { rows: Array<{ input: ElkNode }> };
