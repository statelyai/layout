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
  // Movable containers move and resize with their content. Each one keeps its
  // position most strongly, then its children keep their offsets, then the
  // children keep their own positions; children always stay inside.
  const childrenByParent = new Map<string, (typeof graph.nodes)[number][]>();
  for (const node of graph.nodes)
    if (node.parentId != null && nodes.has(node.parentId) && movableNodes.has(node.parentId))
      childrenByParent.set(node.parentId, [...(childrenByParent.get(node.parentId) ?? []), node]);
  const extents = new Map<string, { right: Variable; bottom: Variable }>();
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
      const parentId = node ? nodes.get(id)?.parentId : undefined;
      const stay =
        parentId != null && childrenByParent.has(parentId)
          ? Strength.weak / 100
          : Strength.weak / 10;
      solver.addConstraint(new Constraint(pair.x, Operator.Eq, rect.x, stay));
      solver.addConstraint(new Constraint(pair.y, Operator.Eq, rect.y, stay));
      if (node && childrenByParent.has(id)) {
        const extent = {
          right: new Variable(`${key}.right`),
          bottom: new Variable(`${key}.bottom`),
        };
        extents.set(id, extent);
        solver.addConstraint(
          new Constraint(extent.right, Operator.Eq, rect.x + rect.width, Strength.weak / 10),
        );
        solver.addConstraint(
          new Constraint(extent.bottom, Operator.Eq, rect.y + rect.height, Strength.weak / 10),
        );
      }
    }
    return { rect, variables: variables.get(key), extent: node ? extents.get(id) : undefined };
  }
  function expression(ref: GeometryReference, attribute: GeometryAttribute): Expression {
    const { rect, variables: pair, extent: far } = geometry(ref);
    const axis = attribute === "y" || attribute === "centerY" || attribute === "bottom" ? "y" : "x";
    const start = new Expression(pair?.[axis] ?? rect[axis]);
    if (far && attribute !== "x" && attribute !== "y") {
      const end = new Expression(axis === "x" ? far.right : far.bottom);
      return attribute.startsWith("center") ? start.plus(end).divide(2) : end;
    }
    const extent = axis === "x" ? rect.width : rect.height;
    const offset = attribute.startsWith("center")
      ? extent / 2
      : attribute === "right" || attribute === "bottom"
        ? extent
        : 0;
    return start.plus(offset);
  }
  for (const [parentId, children] of childrenByParent) {
    const parent = geometry({ nodeId: parentId });
    const container = parent.rect;
    // Keep the original padding, header included.
    const pad = {
      left: Math.min(...children.map((child) => child.x - container.x)),
      top: Math.min(...children.map((child) => child.y - container.y)),
      right: Math.min(
        ...children.map((child) => container.x + container.width - child.x - child.width),
      ),
      bottom: Math.min(
        ...children.map((child) => container.y + container.height - child.y - child.height),
      ),
    };
    for (const child of children) {
      const own = geometry({ nodeId: child.id });
      const x = new Expression(own.variables?.x ?? child.x),
        y = new Expression(own.variables?.y ?? child.y);
      const px = new Expression(parent.variables!.x),
        py = new Expression(parent.variables!.y);
      solver.addConstraint(
        new Constraint(x.minus(px), Operator.Eq, child.x - container.x, Strength.weak / 20),
      );
      solver.addConstraint(
        new Constraint(y.minus(py), Operator.Eq, child.y - container.y, Strength.weak / 20),
      );
      const right = expression({ nodeId: child.id }, "right"),
        bottom = expression({ nodeId: child.id }, "bottom");
      solver.addConstraint(new Constraint(x.minus(px), Operator.Ge, Math.max(0, pad.left)));
      solver.addConstraint(new Constraint(y.minus(py), Operator.Ge, Math.max(0, pad.top)));
      solver.addConstraint(
        new Constraint(
          new Expression(parent.extent!.right).minus(right),
          Operator.Ge,
          Math.max(0, pad.right),
        ),
      );
      solver.addConstraint(
        new Constraint(
          new Expression(parent.extent!.bottom).minus(bottom),
          Operator.Ge,
          Math.max(0, pad.bottom),
        ),
      );
    }
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
  // Overlap is never traded for a constraint. Separate siblings that now
  // overlap, on the axis that separated them before, until none do; a
  // required constraint that needs the overlap fails instead.
  const box = (node: (typeof graph.nodes)[number]) => {
    const pair = variables.get(JSON.stringify(["node", node.id]));
    const extent = extents.get(node.id);
    const x = pair?.x.value() ?? node.x,
      y = pair?.y.value() ?? node.y;
    return {
      x,
      y,
      width: extent ? extent.right.value() - x : node.width,
      height: extent ? extent.bottom.value() - y : node.height,
    };
  };
  const siblingGroups = new Map<string | null, (typeof graph.nodes)[number][]>();
  for (const node of graph.nodes)
    siblingGroups.set(node.parentId ?? null, [
      ...(siblingGroups.get(node.parentId ?? null) ?? []),
      node,
    ]);
  const separated = new Set<string>();
  for (let round = 0; round < 8; round++) {
    let added = false;
    for (const group of siblingGroups.values())
      for (const [index, first] of group.entries())
        for (const second of group.slice(index + 1)) {
          if (!movableNodes.has(first.id) && !movableNodes.has(second.id)) continue;
          const a = box(first),
            b = box(second);
          if (
            a.x >= b.x + b.width ||
            b.x >= a.x + a.width ||
            a.y >= b.y + b.height ||
            b.y >= a.y + a.height
          )
            continue;
          const key = JSON.stringify([first.id, second.id]);
          if (separated.has(key)) continue;
          separated.add(key);
          // Keep the original order on the axis with the larger original gap.
          const gapX = Math.max(
            first.x - second.x - second.width,
            second.x - first.x - first.width,
          );
          const gapY = Math.max(
            first.y - second.y - second.height,
            second.y - first.y - first.height,
          );
          const axis = gapX >= gapY ? "x" : "y";
          const firstLeads =
            axis === "x" ? first.x + first.width <= second.x : first.y + first.height <= second.y;
          const [lead, trail] = firstLeads ? [first, second] : [second, first];
          const end = axis === "x" ? "right" : "bottom";
          const gap = Math.max(0, Math.min(10, Math.max(gapX, gapY)));
          try {
            solver.addConstraint(
              new Constraint(
                expression({ nodeId: trail.id }, axis).minus(expression({ nodeId: lead.id }, end)),
                Operator.Ge,
                gap,
              ),
            );
          } catch {
            const blocking = constraints.find(
              (item) => (item.strength ?? "required") === "required",
            );
            if (blocking)
              constraintFailure(blocking, `would make ${first.id} overlap ${second.id}`);
            throw new LayoutError(
              `Cannot separate ${first.id} from ${second.id}`,
              "UNSATISFIED_CONSTRAINT",
            );
          }
          added = true;
        }
    if (!added) break;
    solver.updateVariables();
  }
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
      if (!pair) return node;
      const x = coordinate(pair.x),
        y = coordinate(pair.y);
      const extent = extents.get(node.id);
      return extent
        ? {
            ...node,
            x,
            y,
            width: coordinate(extent.right) - x,
            height: coordinate(extent.bottom) - y,
          }
        : { ...node, x, y };
    }),
    edges: graph.edges.map((edge) => {
      const pair = variables.get(JSON.stringify(["label", edge.id]));
      return pair ? { ...edge, x: coordinate(pair.x), y: coordinate(pair.y) } : edge;
    }),
  };
}
