import type { CornerRadiusOptions, RoutePath, RoutePoint } from "./types";

export function resolveCornerRadius(options: CornerRadiusOptions, fallback = 10) {
  for (const [name, value] of [
    ["radius", options.radius],
    ["minRadius", options.minRadius],
    ["maxRadius", options.maxRadius],
  ] as const)
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      throw new RangeError(`${name} must be non-negative and finite`);
  const minRadius = options.minRadius ?? 0;
  const maxRadius = options.maxRadius ?? Math.max(options.radius ?? fallback, minRadius);
  if (minRadius > maxRadius) throw new RangeError("minRadius must not exceed maxRadius");
  return {
    radius: Math.max(minRadius, Math.min(maxRadius, options.radius ?? fallback)),
    minRadius,
    maxRadius,
  };
}

export function hasSharpTurn(path: RoutePath): boolean {
  let from = path.start,
    previous: RoutePoint | undefined;
  for (const segment of path.segments) {
    const direction = { x: segment.to.x - from.x, y: segment.to.y - from.y };
    from = segment.to;
    if (segment.kind !== "line") {
      previous = undefined;
      continue;
    }
    if (Math.hypot(direction.x, direction.y) < 1e-9) continue;
    if (
      previous &&
      (Math.abs(previous.x * direction.y - previous.y * direction.x) > 1e-7 ||
        previous.x * direction.x + previous.y * direction.y < 0)
    )
      return true;
    previous = direction;
  }
  return false;
}
export function isRoundedOrthogonalPath(
  path: RoutePath,
  options: ReturnType<typeof resolveCornerRadius>,
): boolean {
  if (options.radius && hasSharpTurn(path)) return false;
  let from = path.start;
  return path.segments.every((segment) => {
    const dx = Math.abs(segment.to.x - from.x),
      dy = Math.abs(segment.to.y - from.y);
    from = segment.to;
    return segment.kind === "line"
      ? dx < 1e-7 || dy < 1e-7
      : segment.kind === "arc" &&
          segment.rotation === 0 &&
          !segment.largeArc &&
          segment.rx <= options.radius + 1e-7 &&
          segment.rx + 1e-7 >= options.minRadius &&
          Math.abs(segment.rx - segment.ry) < 1e-7 &&
          Math.abs(dx - segment.rx) < 1e-7 &&
          Math.abs(dy - segment.ry) < 1e-7;
  });
}
