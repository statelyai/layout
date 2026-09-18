import type { EntityRect, Point } from "@statelyai/graph";

export interface ExteriorLabelEdge {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points: Point[];
}

interface ExteriorLabelSettings {
  inline: boolean;
  placement: string;
}

interface SeparateExteriorLabelsInput<E extends ExteriorLabelEdge> {
  edges: E[];
  nodeRects: readonly EntityRect[];
  direction: "up" | "down" | "left" | "right";
  spacing: number;
  settings: (edge: E) => ExteriorLabelSettings;
}

/** Assigns collision-free cross-axis lanes to inline labels and their route tracks. */
export function separateExteriorLabels<E extends ExteriorLabelEdge>({
  edges,
  nodeRects,
  direction,
  spacing,
  settings,
}: SeparateExteriorLabelsInput<E>): void {
  const horizontalFlow = direction === "left" || direction === "right";
  const nodeCrossStart = Math.min(...nodeRects.map((rect) => (horizontalFlow ? rect.y : rect.x)));
  const nodeCrossEnd = Math.max(
    ...nodeRects.map((rect) => (horizontalFlow ? rect.y + rect.height : rect.x + rect.width)),
  );
  const flowStart = (rect: EntityRect): number => (horizontalFlow ? rect.x : rect.y);
  const flowEnd = (rect: EntityRect): number =>
    horizontalFlow ? rect.x + rect.width : rect.y + rect.height;
  const crossStart = (rect: EntityRect): number => (horizontalFlow ? rect.y : rect.x);
  const crossEnd = (rect: EntityRect): number =>
    horizontalFlow ? rect.y + rect.height : rect.x + rect.width;
  const overlaps = (left: EntityRect, right: EntityRect): boolean =>
    flowStart(left) < flowEnd(right) &&
    flowEnd(left) > flowStart(right) &&
    crossStart(left) < crossEnd(right) &&
    crossEnd(left) > crossStart(right);
  type MutableRect = { x: number; y: number; width: number; height: number };
  const labelRectByEdgeId = new Map<string, MutableRect>(
    edges
      .filter((edge) => edge.width > 0 && edge.height > 0)
      .map((edge) => [
        String(edge.id),
        { x: edge.x, y: edge.y, width: edge.width, height: edge.height },
      ]),
  );
  const movableLabels = edges.flatMap((edge) => {
    const labelRect = labelRectByEdgeId.get(String(edge.id));
    const labelSettings = settings(edge);
    if (!labelRect || !labelSettings.inline || labelSettings.placement !== "CENTER") return [];
    const exteriorTrack = edge.points
      .flatMap((point, index) => {
        const next = edge.points[index + 1];
        if (!next) return [];
        const isFlowSegment = horizontalFlow
          ? point.y === next.y && point.x !== next.x
          : point.x === next.x && point.y !== next.y;
        const trackCross = horizontalFlow ? point.y : point.x;
        return isFlowSegment && (trackCross < nodeCrossStart || trackCross > nodeCrossEnd)
          ? [
              {
                cross: trackCross,
                length: horizontalFlow ? Math.abs(next.x - point.x) : Math.abs(next.y - point.y),
              },
            ]
          : [];
      })
      .sort((left, right) => right.length - left.length)[0];
    const routeTrack =
      exteriorTrack ??
      edge.points
        .flatMap((point, index) => {
          const next = edge.points[index + 1];
          if (!next) return [];
          const isFlowSegment = horizontalFlow
            ? point.y === next.y && point.x !== next.x
            : point.x === next.x && point.y !== next.y;
          if (!isFlowSegment) return [];
          const cross = horizontalFlow ? point.y : point.x;
          return [
            {
              cross,
              length: horizontalFlow ? Math.abs(next.x - point.x) : Math.abs(next.y - point.y),
            },
          ];
        })
        .sort(
          (left, right) =>
            Math.abs(left.cross - (crossStart(labelRect) + crossEnd(labelRect)) / 2) -
              Math.abs(right.cross - (crossStart(labelRect) + crossEnd(labelRect)) / 2) ||
            right.length - left.length,
        )[0];
    return [
      {
        edge,
        exteriorTrack: routeTrack,
        preserveAnchors: exteriorTrack === undefined,
        labelRect,
        lowSide:
          (crossStart(labelRect) + crossEnd(labelRect)) / 2 < (nodeCrossStart + nodeCrossEnd) / 2,
      },
    ];
  });

  movableLabels.sort((left, right) => {
    if (left.lowSide !== right.lowSide) return left.lowSide ? -1 : 1;
    const crossDifference = left.lowSide
      ? crossStart(left.labelRect) - crossStart(right.labelRect)
      : crossStart(right.labelRect) - crossStart(left.labelRect);
    return (
      crossDifference ||
      flowStart(left.labelRect) - flowStart(right.labelRect) ||
      (String(left.edge.id) < String(right.edge.id)
        ? -1
        : String(left.edge.id) > String(right.edge.id)
          ? 1
          : 0)
    );
  });

  for (const { edge, exteriorTrack, labelRect, lowSide, preserveAnchors } of movableLabels) {
    const obstacles = [
      ...nodeRects,
      ...[...labelRectByEdgeId.entries()].flatMap(([edgeId, rect]) =>
        edgeId === String(edge.id) ? [] : [rect],
      ),
    ];
    let totalDelta = 0;
    while (true) {
      const blockers = obstacles.filter((rect) => overlaps(labelRect, rect));
      if (blockers.length === 0) break;
      const desiredCross = lowSide
        ? Math.min(...blockers.map(crossStart)) -
          spacing -
          (horizontalFlow ? edge.height : edge.width)
        : Math.max(...blockers.map(crossEnd)) + spacing;
      const delta = desiredCross - crossStart(labelRect);
      totalDelta += delta;
      if (horizontalFlow) labelRect.y += delta;
      else labelRect.x += delta;
    }
    if (totalDelta === 0) continue;
    if (horizontalFlow) edge.y += totalDelta;
    else edge.x += totalDelta;
    if (!exteriorTrack) continue;
    const originalPoints = edge.points;
    edge.points = edge.points.flatMap((point, index) => {
      const pointCross = horizontalFlow ? point.y : point.x;
      if (pointCross !== exteriorTrack.cross) return [point];
      const shifted = horizontalFlow
        ? { ...point, y: point.y + totalDelta }
        : { ...point, x: point.x + totalDelta };
      // Keep authored endpoint anchors attached when the chosen track ends there.
      return preserveAnchors && index === 0
        ? [point, shifted]
        : preserveAnchors && index === originalPoints.length - 1
          ? [shifted, point]
          : [shifted];
    });
  }
}
