import { traceLayeredPhase } from "../internal/layered-trace";
import type { LayerSweepSession } from "./strategies";
import type { LayerOrder } from "./types";

/** Internal prepared scope; boundary callbacks synchronize parent ports and child dummies. */
export interface HierarchyCrossingScope {
  readonly session: LayerSweepSession;
  readonly childrenByNodeId: ReadonlyMap<string, HierarchyCrossingScope>;
  readonly useBottomUp: boolean;
  /** ELK child graph heuristics retain their own graph random stream. */
  readonly independentRandom?: boolean;
  /** Returns true when an external first layer was ordered from parent ports. */
  alignBoundary?(forward: boolean): boolean;
  publishBoundary?(forward: boolean): void;
  publishBottomUp?(): void;
}

/**
 * ELK's counter-based hierarchy traversal: enter children between parent layers,
 * count the coupled subtree, and retain all of its node/port orders together.
 * Scope assembly, sweepiness selection and boundary-port mapping belong to the
 * caller; this coordinator does not infer them from finalized geometry.
 */
export function minimizeHierarchyCrossings(
  root: HierarchyCrossingScope,
): ReadonlyMap<HierarchyCrossingScope, LayerOrder> {
  if (!root.useBottomUp) throw new Error("Root crossing scope must be bottom-up");
  const scopes = [root],
    seen = new Set([root]);
  for (let index = 0; index < scopes.length; index++) {
    const scope = scopes[index]!;
    const nodeIds = new Set(scope.session.snapshot().layers.flat());
    for (const [id, child] of scope.childrenByNodeId) {
      if (!nodeIds.has(id)) throw new Error(`Missing parent crossing node ${id}`);
      scope.session.markHierarchicalNode(id);
      if (seen.has(child)) throw new Error("Crossing scopes must form a tree");
      seen.add(child);
      scopes.push(child);
    }
  }
  const initialRandom = root.session.random.clone();
  const coupled = (scope: HierarchyCrossingScope): HierarchyCrossingScope[] => [
    scope,
    ...[...scope.childrenByNodeId.values()].flatMap((child) =>
      child.useBottomUp ? [] : coupled(child),
    ),
  ];
  const sweep = (scope: HierarchyCrossingScope, forward: boolean, first: boolean): void => {
    scope.session.sweep(forward, first, (_layer, ids) => {
      for (const id of ids) {
        const child = scope.childrenByNodeId.get(id);
        if (!child || child.useBottomUp) continue;
        if (!child.alignBoundary?.(forward)) child.session.shuffleFirstLayer(forward);
        sweep(child, forward, first);
        child.publishBoundary?.(forward);
      }
    });
  };
  // ELK prepends every bottom-up scope during breadth-first initialization.
  for (const scope of [...scopes].reverse().filter((scope) => scope.useBottomUp)) {
    const stream = initialRandom.clone();
    for (const scope of scopes) if (!scope.independentRandom) scope.session.useRandom(stream);
    const subtree = coupled(scope);
    const snapshot = () => new Map(subtree.map((scope) => [scope, scope.session.snapshot()]));
    const count = () => subtree.reduce((total, scope) => total + scope.session.countCrossings(), 0);
    const rollback = subtree.some((scope) => scope.session.restoreRejectedSweep);
    let bestCount = Number.POSITIVE_INFINITY,
      best = snapshot();
    for (let attempt = 0; attempt < scope.session.attempts; attempt++) {
      let forward = stream.nextBoolean();
      if (scope.session.usesInitialModelOrder && attempt === 0) {
        if (attempt === 0 && count() === 0) {
          bestCount = 0;
          best = snapshot();
          break;
        }
        // ELK 0.11.1 gives FIRST_TRY and SECOND_TRY the same property id.
        // Clearing SECOND_TRY therefore clears FIRST_TRY after this attempt.
        forward = true;
      } else scope.session.shuffleFirstLayer(forward);
      sweep(scope, forward, true);
      scope.session.finishInitialOrderAttempt?.();
      let crossings = count(),
        selected = snapshot();
      const trace = (first: boolean, value: number) =>
        traceLayeredPhase(() => ({
          kind: "sweep",
          scope: scope.session.scope,
          attempt,
          forward,
          firstSweep: first,
          crossings: value,
          layers: scope.session.snapshot().layers,
        }));
      trace(true, crossings);
      while (crossings > 0) {
        forward = !forward;
        const previous = rollback ? snapshot() : undefined;
        sweep(scope, forward, false);
        const next = count();
        trace(false, next);
        if (next >= crossings) {
          // Preserve the legacy wrapped/unzipped standalone rollback policy.
          for (const [scope, order] of previous ?? [])
            if (scope.session.restoreRejectedSweep) scope.session.restore(order);
          break;
        }
        crossings = next;
        selected = snapshot();
      }
      if (crossings < bestCount) {
        bestCount = crossings;
        best = selected;
        if (crossings === 0) break;
      }
    }
    for (const [scope, order] of best) scope.session.restore(order);
    scope.publishBottomUp?.();
  }
  return new Map(scopes.map((scope) => [scope, scope.session.finish(scope.session.snapshot())]));
}
