/*******************************************************************************
 * Copyright (c) 2014, 2018 Kiel University and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { Point } from "@statelyai/graph";

function interpolate(left: Point, right: Point, ratio: number): Point {
  return {
    x: (1 - ratio) * left.x + ratio * right.x,
    y: (1 - ratio) * left.y + ratio * right.y,
  };
}

/** Convert ELK's clamped uniform cubic NUB spline to equivalent Bezier control points. */
export function uniformCubicSplineToBezier(values: readonly Point[]): Point[] {
  const points = values.map((point) => ({ ...point }));
  while (points.length < 4) points.unshift({ ...points[0]! });
  const degree = 3;
  const segmentCount = points.length - degree;
  let knots = [
    ...Array.from({ length: degree + 1 }, () => 0),
    ...Array.from(
      { length: Math.max(0, segmentCount - 1) },
      (_, index) => (index + 1) / segmentCount,
    ),
    ...Array.from({ length: degree + 1 }, () => 1),
  ];

  const insertKnot = (knot: number) => {
    const nodeCount = points.length - 1;
    let span = nodeCount;
    for (let index = degree; index <= nodeCount; index++) {
      if (knot >= knots[index]! && knot < knots[index + 1]!) {
        span = index;
        break;
      }
    }
    const multiplicity = knots.filter((candidate) => Math.abs(candidate - knot) < 1e-6).length;
    const next = Array.from({ length: points.length + 1 }, () => ({ x: 0, y: 0 }));
    for (let index = 0; index <= span - degree; index++) next[index] = points[index]!;
    for (let index = span - multiplicity; index <= nodeCount; index++) {
      next[index + 1] = points[index]!;
    }
    for (let index = span - degree + 1; index <= span - multiplicity; index++) {
      const ratio = (knot - knots[index]!) / (knots[index + degree]! - knots[index]!);
      next[index] = interpolate(points[index - 1]!, points[index]!, ratio);
    }
    points.splice(0, points.length, ...next);
    knots = [...knots.slice(0, span + 1), knot, ...knots.slice(span + 1)];
  };

  for (let segment = 1; segment < segmentCount; segment++) {
    const knot = segment / segmentCount;
    for (let insertion = 1; insertion < degree; insertion++) insertKnot(knot);
  }
  return points;
}

function absMin(first: number, second: number): number {
  return Math.abs(first) < Math.abs(second) ? first : second;
}

export function conservativeSpline(
  start: Point,
  end: Point,
  track: number,
  horizontal: boolean,
  softenNodeAttachments: boolean,
): Point[] {
  const sourceCross = horizontal ? start.y : start.x;
  const targetCross = horizontal ? end.y : end.x;
  const straight = Math.abs(sourceCross - targetCross) < 1e-6;
  const controlPoints = straight
    ? [{ ...start }, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, { ...end }]
    : [
        { ...start },
        { ...start },
        horizontal ? { x: track, y: start.y } : { x: start.x, y: track },
        horizontal ? { x: track, y: end.y } : { x: end.x, y: track },
        { ...end },
        { ...end },
      ];
  if (!softenNodeAttachments) {
    const flowSign = Math.sign(horizontal ? end.x - start.x : end.y - start.y) || 1;
    const second = controlPoints[1]!;
    controlPoints.splice(1, 0, {
      x: start.x + absMin(horizontal ? flowSign * 5 : 0, second.x - start.x),
      y: start.y + absMin(horizontal ? 0 : flowSign * 5, second.y - start.y),
    });
    const secondLast = controlPoints.at(-2)!;
    controlPoints.splice(-1, 0, {
      x: end.x + absMin(horizontal ? -flowSign * 5 : 0, secondLast.x - end.x),
      y: end.y + absMin(horizontal ? 0 : -flowSign * 5, secondLast.y - end.y),
    });
  }
  return uniformCubicSplineToBezier(controlPoints);
}
