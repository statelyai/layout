import { updateRoutes, type UpdateRoutesOptions } from "./api";
import { createGraphNode, createGraphEdge, type GraphDiff } from "@statelyai/graph";
import type {
  RoutingGraph,
  RoutingSettings,
  RoutingSnapshot,
  RoutingUpdate,
  RoutingUpdateScope,
} from "./types";

interface EntityChanges<T> {
  added: T[];
  removed: T[];
  updated: { id: string; old: Partial<T>; new: Partial<T> }[];
}
function mergeEntities<T extends { id: string }>(
  diffs: readonly EntityChanges<T>[],
): EntityChanges<T> {
  type Change =
    | { kind: "added"; next: T }
    | { kind: "removed"; old: T }
    | { kind: "updated"; old: Partial<T>; next: Partial<T> };
  const changes = new Map<string, Change>();
  for (const diff of diffs) {
    for (const added of diff.added) {
      const previous = changes.get(added.id);
      if (previous && previous.kind !== "removed")
        throw new Error(`Routing changes add existing entity ${added.id}`);
      changes.set(
        added.id,
        previous
          ? { kind: "updated", old: previous.old, next: added }
          : { kind: "added", next: added },
      );
    }
    for (const updated of diff.updated) {
      const previous = changes.get(updated.id);
      if (previous?.kind === "removed")
        throw new Error(`Routing changes update removed entity ${updated.id}`);
      changes.set(
        updated.id,
        previous?.kind === "added"
          ? { kind: "added", next: { ...previous.next, ...updated.new } }
          : {
              kind: "updated",
              old: { ...updated.old, ...previous?.old },
              next: { ...previous?.next, ...updated.new },
            },
      );
    }
    for (const removed of diff.removed) {
      const previous = changes.get(removed.id);
      if (previous?.kind === "removed")
        throw new Error(`Routing changes remove missing entity ${removed.id}`);
      if (previous?.kind === "added") changes.delete(removed.id);
      else changes.set(removed.id, { kind: "removed", old: { ...removed, ...previous?.old } });
    }
  }
  const result: EntityChanges<T> = { added: [], updated: [], removed: [] };
  for (const [id, change] of changes) {
    switch (change.kind) {
      case "added":
        result.added.push(change.next);
        break;
      case "removed":
        result.removed.push(change.old);
        break;
      case "updated":
        result.updated.push({ id, old: change.old, new: change.next });
        break;
    }
  }
  return result;
}

/** Compose consecutive edit diffs without comparing or reading graph arrays. */
export function mergeRoutingChanges(
  diffs: readonly GraphDiff<unknown, unknown>[],
): GraphDiff<unknown, unknown> {
  return {
    nodes: mergeEntities(
      diffs.map((diff) => ({
        ...diff.nodes,
        added: diff.nodes.added.map((node) => createGraphNode(node)),
        removed: diff.nodes.removed.map((node) => createGraphNode(node)),
      })),
    ),
    edges: mergeEntities(
      diffs.map((diff) => ({
        ...diff.edges,
        added: diff.edges.added.map((edge) => createGraphEdge(edge)),
        removed: diff.edges.removed.map((edge) => createGraphEdge(edge)),
      })),
    ),
  };
}

export interface RoutingSchedulerOptions {
  readonly snapshot: RoutingSnapshot;
  readonly onUpdate: (update: RoutingUpdate) => void;
  readonly onError: (error: unknown) => void;
  /** A worker adapter can honor the signal; native synchronous routing cannot be preempted. */
  readonly update?: (
    options: UpdateRoutesOptions,
    signal: AbortSignal,
  ) => RoutingUpdate | Promise<RoutingUpdate>;
  /** Schedule a flush and return a cancellation callback. Defaults to one microtask. */
  readonly schedule?: (flush: () => void) => () => void;
}
export interface RoutingScheduler {
  readonly snapshot: RoutingSnapshot;
  enqueue(edit: {
    readonly graph: RoutingGraph;
    readonly changes: GraphDiff<unknown, unknown>;
    readonly settings?: RoutingSettings;
    readonly scope?: RoutingUpdateScope;
  }): void;
  flush(): Promise<void>;
  dispose(): void;
}

/** Optional editor-local scheduling; immutable routing itself has no session or singleton. */
export function createRoutingScheduler(options: RoutingSchedulerOptions): RoutingScheduler {
  let current = options.snapshot,
    latestGraph: RoutingGraph | undefined,
    latestSettings: RoutingSettings | undefined,
    latestScope: RoutingUpdateScope | undefined,
    version = 0,
    disposed = false,
    cancelSchedule: (() => void) | undefined,
    controller: AbortController | undefined,
    running: Promise<void> | undefined,
    failedVersion: number | undefined;
  const pending: GraphDiff<unknown, unknown>[] = [];
  const schedule =
    options.schedule ??
    ((flush: () => void) => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) flush();
      });
      return () => {
        cancelled = true;
      };
    });
  const requestFlush = () => {
    if (disposed || cancelSchedule || running) return;
    cancelSchedule = schedule(() => {
      cancelSchedule = undefined;
      void flush();
    });
  };
  async function run() {
    while (!disposed && latestGraph && pending.length) {
      const base = current,
        requestedVersion = version;
      controller = new AbortController();
      try {
        const result = await (options.update ?? updateRoutes)(
          {
            previous: base,
            graph: latestGraph,
            changes: mergeRoutingChanges(pending),
            settings: latestSettings,
            scope: latestScope,
          },
          controller.signal,
        );
        if (disposed) return;
        if (requestedVersion !== version) continue;
        if (result.base !== base)
          throw new Error("Routing executor returned a result for a different base snapshot");
        current = result.snapshot;
        pending.length = 0;
        latestSettings = undefined;
        latestScope = undefined;
        failedVersion = undefined;
        options.onUpdate(result);
      } catch (error) {
        if (disposed) return;
        if (requestedVersion !== version) continue;
        failedVersion = requestedVersion;
        options.onError(error);
        return; // Keep pending edits so a later enqueue/explicit flush can retry safely.
      }
    }
  }
  function flush(): Promise<void> {
    cancelSchedule?.();
    cancelSchedule = undefined;
    if (disposed) return Promise.resolve();
    if (running) return running;
    running = run().finally(() => {
      running = undefined;
      controller = undefined;
      if (pending.length && version !== failedVersion) requestFlush();
    });
    return running;
  }
  return {
    get snapshot() {
      return current;
    },
    enqueue(edit) {
      if (disposed) throw new Error("Routing scheduler is disposed");
      latestGraph = edit.graph;
      if (edit.settings !== undefined) latestSettings = edit.settings;
      latestScope = !pending.length
        ? edit.scope
        : latestScope?.kind === "selected" && edit.scope?.kind === "selected"
          ? {
              kind: "selected",
              edgeIds: [...new Set([...latestScope.edgeIds, ...edit.scope.edgeIds])],
            }
          : undefined;
      pending.push(edit.changes);
      version++;
      controller?.abort();
      requestFlush();
    },
    flush,
    dispose() {
      disposed = true;
      version++;
      pending.length = 0;
      cancelSchedule?.();
      cancelSchedule = undefined;
      controller?.abort();
    },
  };
}
