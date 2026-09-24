import { Constraint, Expression, Operator, Solver, Strength, Variable } from "@lume/kiwi";
import type { VisualGraph } from "@statelyai/graph";
import { LayoutError } from "./errors";
import type { LayoutDiagnostic } from "./types";

export type GeometryReference = { nodeId: string } | { edgeId: string; part: "label" };
export type ConstraintStrength = "required" | "strong" | "medium" | "weak";
export type GeometryAttribute = "x" | "y" | "centerX" | "centerY" | "right" | "bottom";
interface ConstraintBase {
  id: string;
  strength?: ConstraintStrength;
}
export interface AlignConstraint extends ConstraintBase {
  kind: "align";
  entities: readonly GeometryReference[];
  axis: "x" | "y";
  anchor?: "start" | "center" | "end";
}
export interface DistributeConstraint extends ConstraintBase {
  kind: "distribute";
  entities: readonly GeometryReference[];
  axis: "x" | "y";
  spacing?: "gaps" | "centers";
  gap?: number;
}
export interface PinConstraint extends ConstraintBase {
  kind: "pin";
  entity: GeometryReference;
  x?: number;
  y?: number;
}
export interface LinearConstraint extends ConstraintBase {
  kind: "linear";
  terms: readonly {
    entity: GeometryReference;
    attribute: GeometryAttribute;
    coefficient: number;
  }[];
  relation: "eq" | "le" | "ge";
  value: number;
}
export interface WaypointConstraint extends ConstraintBase {
  kind: "waypoint";
  edgeId: string;
  point: { x: number; y: number };
}
export type LayoutConstraint =
  | AlignConstraint
  | DistributeConstraint
  | PinConstraint
  | LinearConstraint
  | WaypointConstraint;

/** Serializable constraint constructors; graph geometry stays in @statelyai/graph. */
export const c = {
  align: (value: Omit<AlignConstraint, "kind">): AlignConstraint => ({ ...value, kind: "align" }),
  distribute: (value: Omit<DistributeConstraint, "kind">): DistributeConstraint => ({
    ...value,
    kind: "distribute",
  }),
  pin: (value: Omit<PinConstraint, "kind">): PinConstraint => ({ ...value, kind: "pin" }),
  linear: (value: Omit<LinearConstraint, "kind">): LinearConstraint => ({
    ...value,
    kind: "linear",
  }),
  waypoint: (value: Omit<WaypointConstraint, "kind">): WaypointConstraint => ({
    ...value,
    kind: "waypoint",
  }),
};

export function constraintFailure(constraint: LayoutConstraint, message: string): never {
  throw new LayoutError(`${constraint.id}: ${message}`, "UNSATISFIED_CONSTRAINT");
}

/** Solve positions only. Fixed geometry is represented by constants, never edit variables. */
export function solveGeometryConstraints<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  constraints: readonly LayoutConstraint[],
  movableNodes: ReadonlySet<string>,
  movableLabels: ReadonlySet<string>,
  diagnostics: LayoutDiagnostic[],
): VisualGraph<N, E, G, P> {
  const solver = new Solver();
  const variables = new Map<string, { x: Variable; y: Variable }>();
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  function geometry(ref: GeometryReference) {
    const node = "nodeId" in ref;
    const id = node ? ref.nodeId : ref.edgeId;
    const rect = node ? nodes.get(id) : edges.get(id);
    if (!rect) throw new LayoutError(`Unknown constraint entity: ${id}`, "INVALID_CONSTRAINT");
    const key = JSON.stringify([node ? "node" : "label", id]);
    const movable = (node ? movableNodes : movableLabels).has(id);
    if (movable && !variables.has(key)) {
      const pair = { x: new Variable(`${key}.x`), y: new Variable(`${key}.y`) };
      variables.set(key, pair);
      solver.addConstraint(new Constraint(pair.x, Operator.Eq, rect.x, Strength.weak / 10));
      solver.addConstraint(new Constraint(pair.y, Operator.Eq, rect.y, Strength.weak / 10));
    }
    return { rect, variables: variables.get(key) };
  }
  function expression(ref: GeometryReference, attribute: GeometryAttribute): Expression {
    const { rect, variables: pair } = geometry(ref);
    const axis = attribute === "y" || attribute === "centerY" || attribute === "bottom" ? "y" : "x";
    const extent = axis === "x" ? rect.width : rect.height;
    const offset = attribute.startsWith("center")
      ? extent / 2
      : attribute === "right" || attribute === "bottom"
        ? extent
        : 0;
    return new Expression(pair?.[axis] ?? rect[axis], offset);
  }
  const checks: { constraint: LayoutConstraint; expression: Expression; operator: Operator }[] = [];
  const ids = new Set<string>();
  for (const constraint of constraints) {
    if (ids.has(constraint.id))
      throw new LayoutError(`Duplicate constraint ID: ${constraint.id}`, "INVALID_CONSTRAINT");
    ids.add(constraint.id);
    if (constraint.kind === "waypoint") continue;
    const strength = Strength[constraint.strength ?? "required"];
    const add = (lhs: Expression, operator = Operator.Eq, rhs: Expression | number = 0) => {
      const difference = lhs.minus(rhs);
      if (
        !Number.isFinite(difference.constant()) ||
        !difference.terms().array.every((item) => Number.isFinite(item.second))
      ) {
        throw new LayoutError(`${constraint.id}: non-finite expression`, "INVALID_CONSTRAINT");
      }
      try {
        solver.addConstraint(new Constraint(difference, operator, 0, strength));
      } catch {
        constraintFailure(
          constraint,
          "conflicts with fixed geometry or another required constraint",
        );
      }
      checks.push({ constraint, expression: difference, operator });
    };
    if (constraint.kind === "linear") {
      let value = new Expression();
      for (const term of constraint.terms)
        value = value.plus(expression(term.entity, term.attribute).multiply(term.coefficient));
      add(
        value,
        { eq: Operator.Eq, le: Operator.Le, ge: Operator.Ge }[constraint.relation],
        constraint.value,
      );
    } else if (constraint.kind === "pin") {
      geometry(constraint.entity);
      if (constraint.x !== undefined)
        add(expression(constraint.entity, "x"), Operator.Eq, constraint.x);
      if (constraint.y !== undefined)
        add(expression(constraint.entity, "y"), Operator.Eq, constraint.y);
    } else {
      const refs = constraint.entities;
      // Validate even a singleton reference.
      for (const ref of refs) geometry(ref);
      const axis = constraint.axis;
      const end = axis === "x" ? "right" : "bottom";
      const center = axis === "x" ? "centerX" : "centerY";
      if (constraint.kind === "align") {
        const attr =
          constraint.anchor === "start" ? axis : constraint.anchor === "end" ? end : center;
        for (const ref of refs.slice(1))
          add(expression(ref, attr), Operator.Eq, expression(refs[0]!, attr));
      } else {
        const gaps = refs
          .slice(1)
          .map((ref, i) =>
            constraint.spacing === "centers"
              ? expression(ref, center).minus(expression(refs[i]!, center))
              : expression(ref, axis).minus(expression(refs[i]!, end)),
          );
        for (const gap of gaps) {
          add(gap, Operator.Ge, 0);
          add(gap, Operator.Eq, constraint.gap ?? gaps[0]!);
        }
      }
    }
  }
  solver.updateVariables();
  const warned = new Set<string>();
  for (const check of checks) {
    const residual = check.expression.value();
    const violated =
      check.operator === Operator.Eq
        ? Math.abs(residual) > 1e-6
        : check.operator === Operator.Le
          ? residual > 1e-6
          : residual < -1e-6;
    if (violated && !warned.has(check.constraint.id)) {
      warned.add(check.constraint.id);
      diagnostics.push({
        severity: "warning",
        code: "CONSTRAINT_VIOLATION",
        message: `Constraint ${check.constraint.id} could not be satisfied`,
        constraintIds: [check.constraint.id],
      });
    }
  }
  const coordinate = (variable: Variable): number => {
    const value = variable.value();
    if (!Number.isFinite(value))
      throw new LayoutError(
        "Constraint solution contains non-finite geometry",
        "INVALID_CONSTRAINT",
      );
    return value === 0 ? 0 : value;
  };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const pair = variables.get(JSON.stringify(["node", node.id]));
      return pair ? { ...node, x: coordinate(pair.x), y: coordinate(pair.y) } : node;
    }),
    edges: graph.edges.map((edge) => {
      const pair = variables.get(JSON.stringify(["label", edge.id]));
      return pair ? { ...edge, x: coordinate(pair.x), y: coordinate(pair.y) } : edge;
    }),
  };
}
