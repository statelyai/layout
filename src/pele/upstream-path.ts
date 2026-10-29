// @ts-nocheck -- Vendored upstream uses unchecked typed-array indexing.
// Copyright (c) 2026 kepano. SPDX-License-Identifier: MIT
// Pele 36e584d59152181927e0d8bf70fddcd2a5f33d6c, src/svg/edges.ts.
// Original algorithm retained; see NOTICE.md for license and provenance.
import { ease } from "./upstream";
export interface EdgePath {
  d: string;
  tokens?: number[];
  sx: number;
  sy: number;
  sdx: number;
  sdy: number;
  ex: number;
  ey: number;
  edx: number;
  edy: number;
}

const CORNER = 12;
const HANDLE = 0.62;
const LEAD = 6;
const num = (v: number): string => String(written(v));
function written(v: number): number {
  const n = Math.round(v * 100);
  return n === 0 ? 0 : n / 100;
}
// Builds the path for a route of x, y, axis triples, trimming both ends to leave room for markers.
// Between two points that are not in line, a route is one S that leaves and arrives along the
// flow, or a step in a stepped route. Where the route itself turns a corner, a stepped route
// rounds it a little, and any other but a linear one turns as widely as it can: the turn takes
// the whole of a leg that ends at a node and half of a leg it shares with the next turn.
// `startReach` and `endReach` say how far from its nodes the edge starts to turn, where the
// other edges on the same side of a node need it to; by default, far enough to clear its own marker.
export function routePath(
  route: number[],
  curve: string | undefined,
  startTrim: number,
  endTrim: number,
  startReach = startTrim > 0 ? startTrim + LEAD : 0,
  endReach = endTrim > 0 ? endTrim + LEAD : 0,
): EdgePath {
  const linear = curve === "linear";
  const stepped = curve === "step" || curve === "stepBefore" || curve === "stepAfter";
  const xs: number[] = [];
  const ys: number[] = [];
  const axes: number[] = [];
  const near = (ax: number, ay: number, bx: number, by: number): boolean =>
    Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01;
  for (let i = 0; i < route.length; i += 3) {
    const x = route[i];
    const y = route[i + 1];
    const axis = route[i + 2];
    const last = xs.length - 1;
    // A stepped route turns at right angles where a smooth one would curve.
    if (stepped && last >= 0 && Math.abs(x - xs[last]) >= 0.01 && Math.abs(y - ys[last]) >= 0.01) {
      const px = xs[last];
      const py = ys[last];
      const my = curve === "stepBefore" ? py : curve === "stepAfter" ? y : (py + y) / 2;
      const mx = curve === "stepBefore" ? px : curve === "stepAfter" ? x : (px + x) / 2;
      const turns = axis === 0 ? [px, my, x, my] : [mx, py, mx, y];
      for (let k = 0; k < 4; k += 2) {
        if (near(turns[k], turns[k + 1], px, py) || near(turns[k], turns[k + 1], x, y)) continue;
        xs.push(turns[k]);
        ys.push(turns[k + 1]);
        axes.push(axis);
      }
    }
    xs.push(x);
    ys.push(y);
    axes.push(axis);
  }
  let last = xs.length - 1;
  const aligned = (i: number): boolean =>
    Math.abs(xs[i] - xs[i - 1]) < 0.01 || Math.abs(ys[i] - ys[i - 1]) < 0.01;
  const straight = (i: number): boolean => linear || aligned(i);
  // The way the route heads from point i to point j: along the flow where an S joins them.
  const unit = (i: number, j: number, axis: number): [number, number] => {
    if (!straight(Math.max(i, j)))
      return axis === 0 ? [0, Math.sign(ys[j] - ys[i]) || 1] : [Math.sign(xs[j] - xs[i]) || 1, 0];
    const dx = xs[j] - xs[i];
    const dy = ys[j] - ys[i];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const [sdx, sdy] = unit(0, 1, axes[1]);
  const [edx, edy] = unit(last - 1, last, axes[last]);
  const sx = xs[0];
  const sy = ys[0];
  const ex = xs[last];
  const ey = ys[last];
  xs[0] += sdx * startTrim;
  ys[0] += sdy * startTrim;
  xs[last] -= edx * endTrim;
  ys[last] -= edy * endTrim;
  const length = (i: number): number => Math.abs(xs[i] - xs[i - 1]) + Math.abs(ys[i] - ys[i - 1]);
  // Whether the route turns a corner at point i, from running one way to running the other.
  const turns = (i: number): boolean =>
    !linear &&
    i > 0 &&
    i < last &&
    aligned(i) &&
    aligned(i + 1) &&
    length(i) >= 0.01 &&
    length(i + 1) >= 0.01 &&
    Math.abs(xs[i] - xs[i - 1]) < 0.01 !== Math.abs(xs[i + 1] - xs[i]) < 0.01;
  // An edge that curves into a marker runs straight for a little way first, where it has the
  // room, so that the marker does not sit on the bend.
  const along = (i: number, ux: number, uy: number): number =>
    Math.abs(xs[i] - xs[i - 1]) * Math.abs(ux) + Math.abs(ys[i] - ys[i - 1]) * Math.abs(uy);
  // Of the way from the end of a run to where it turns, the part that makes up for a larger
  // marker beside this one is kept where it can be, and the rest is at most a quarter of what
  // is left, so that ends on one side of a node turn equally far from it.
  const lead = (reach: number, trim: number, run: number): number => {
    const room = Math.min(Math.max(0, reach - LEAD - trim), run / 4);
    return room + Math.min(reach - trim - room, (run - room) / 4);
  };
  const arrives =
    endReach > endTrim && (!straight(last) || turns(last - 1))
      ? lead(endReach, endTrim, along(last, edx, edy))
      : 0;
  const leaves =
    startReach > startTrim && (!straight(1) || turns(1))
      ? lead(startReach, startTrim, along(1, sdx, sdy))
      : 0;
  if (arrives >= 1) {
    xs.splice(last, 0, xs[last] - edx * arrives);
    ys.splice(last, 0, ys[last] - edy * arrives);
    axes.splice(last, 0, axes[last]);
    last++;
  }
  if (leaves >= 1) {
    xs.splice(1, 0, xs[0] + sdx * leaves);
    ys.splice(1, 0, ys[0] + sdy * leaves);
    axes.splice(1, 0, axes[1]);
    last++;
  }

  // Keep tokens to avoid parsing d when checking fills.
  const tokens: number[] = [];
  const tok = (v: number): string => {
    tokens.push(written(v));
    return num(v);
  };
  tokens.push(77, 2);
  let d = `M${tok(xs[0])},${tok(ys[0])}`;
  let atX = xs[0];
  let atY = ys[0];
  const lineTo = (x: number, y: number): void => {
    if (near(x, y, atX, atY)) return;
    tokens.push(76, 2);
    d += `L${tok(x)},${tok(y)}`;
    atX = x;
    atY = y;
  };
  for (let i = 1; i <= last; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!straight(i)) {
      const down = axes[i] === 0;
      const along = down ? y - atY : x - atX;
      const k = Math.abs(along) * ease(down ? x - atX : y - atY, along);
      const ux = down ? 0 : Math.sign(along) * k;
      const uy = down ? Math.sign(along) * k : 0;
      tokens.push(67, 6);
      d += `C${tok(atX + ux)},${tok(atY + uy)} ${tok(x - ux)},${tok(y - uy)} ${tok(x)},${tok(y)}`;
      atX = x;
      atY = y;
      continue;
    }
    if (!turns(i)) {
      // A point part of the way along one straight run adds nothing to the path.
      if (
        i < last &&
        aligned(i) &&
        aligned(i + 1) &&
        (x - xs[i - 1]) * (xs[i + 1] - x) + (y - ys[i - 1]) * (ys[i + 1] - y) > 0
      )
        continue;
      lineTo(x, y);
      continue;
    }
    // How much of the leg before the turn and of the leg after it the turn takes: all of one
    // that ends at a node, short of the straight run into a marker, and half of one it shares.
    let before = turns(i - 1) ? length(i) / 2 : length(i);
    let after = turns(i + 1) ? length(i + 1) / 2 : length(i + 1);
    if (stepped) before = after = Math.min(CORNER, before, after);
    const [ux, uy] = unit(i - 1, i, axes[i]);
    const [vx, vy] = unit(i, i + 1, axes[i + 1]);
    lineTo(x - ux * before, y - uy * before);
    atX = x + vx * after;
    atY = y + vy * after;
    if (stepped) {
      tokens.push(81, 4);
      d += `Q${tok(x)},${tok(y)} ${tok(atX)},${tok(atY)}`;
    } else {
      tokens.push(67, 6);
      d += `C${tok(x - ux * before * (1 - HANDLE))},${tok(y - uy * before * (1 - HANDLE))} ${tok(x + vx * after * (1 - HANDLE))},${tok(y + vy * after * (1 - HANDLE))} ${tok(atX)},${tok(atY)}`;
    }
  }
  return { d, tokens, sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
}
