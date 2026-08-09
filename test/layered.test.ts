import { createGraph } from '@statelyai/graph';
import type { LayoutFn } from '@statelyai/graph/layout';
import { describe, expect, it } from 'vitest';
import {
  getLayeredLayout,
  getLayout,
  breakCyclesWithDepthFirstSearch,
  routeEdgesOrthogonally,
  UnsupportedLayoutError,
  type LayeredLayoutOptions,
} from '../src';

const asGraphLayout: LayoutFn<LayeredLayoutOptions> = getLayeredLayout;
void asGraphLayout;

function createDiamond() {
  return createGraph({
    id: 'diamond',
    nodes: [
      { id: 'a', width: 80, height: 40, data: { role: 'start' } },
      { id: 'b', width: 80, height: 40 },
      { id: 'c', width: 80, height: 40 },
      { id: 'd', width: 80, height: 40 },
    ],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'bd', sourceId: 'b', targetId: 'd' },
      { id: 'cd', sourceId: 'c', targetId: 'd' },
    ],
  });
}

describe('getLayeredLayout', () => {
  it('lays out a graph without mutating it', () => {
    const graph = createDiamond();
    const before = structuredClone(graph);
    const result = getLayeredLayout(graph, { direction: 'right' });

    expect(graph).toEqual(before);
    expect(result.nodes.find((node) => node.id === 'a')?.x).toBeLessThan(
      result.nodes.find((node) => node.id === 'b')?.x ?? 0,
    );
    expect(result.nodes.find((node) => node.id === 'b')?.x).toBe(
      result.nodes.find((node) => node.id === 'c')?.x,
    );
    expect(result.nodes.find((node) => node.id === 'd')?.x).toBeGreaterThan(
      result.nodes.find((node) => node.id === 'b')?.x ?? Infinity,
    );
    expect(result.nodes[0]?.data).toEqual({ role: 'start' });
    expect(result.edges.every((edge) => edge.routing === 'orthogonal')).toBe(
      true,
    );
  });

  it('is deterministic for cyclic graphs', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ca', sourceId: 'c', targetId: 'a' },
        { id: 'aa', sourceId: 'a', targetId: 'a' },
      ],
    });

    expect(getLayeredLayout(graph)).toEqual(getLayeredLayout(graph));
    expect(getLayeredLayout(graph).edges.find((edge) => edge.id === 'aa')?.points)
      .toHaveLength(4);
  });

  it('lays out named ports and routes through them', () => {
    const graph = createGraph({
      nodes: [
        {
          id: 'a',
          ports: [{ name: 'out', direction: 'out' }],
        },
        {
          id: 'b',
          ports: [{ name: 'in', direction: 'in' }],
        },
      ],
      edges: [
        {
          id: 'ab',
          sourceId: 'a',
          sourcePort: 'out',
          targetId: 'b',
          targetPort: 'in',
        },
      ],
    });

    const result = getLayeredLayout(graph, { direction: 'right' });
    const source = result.nodes.find((node) => node.id === 'a');
    const sourcePort = source?.ports?.[0];
    const routeStart = result.edges[0]?.points?.[0];

    expect((sourcePort?.x ?? 0) + (sourcePort?.width ?? 0) / 2).toBe(
      source?.width,
    );
    expect(routeStart?.x).toBe(
      (source?.x ?? 0) + (sourcePort?.x ?? 0) + (sourcePort?.width ?? 0) / 2,
    );
  });

  it('accepts a custom routing strategy', () => {
    const graph = createDiamond();
    let called = false;
    const result = getLayeredLayout(graph, {
      strategies: {
        routeEdges(input, orientation, placement) {
          called = true;
          return routeEdgesOrthogonally(input, orientation, placement);
        },
      },
    });

    expect(called).toBe(true);
    expect(result.edges[0]?.points?.length).toBeGreaterThan(1);
  });

  it('rejects hierarchy until the compound-graph milestone', () => {
    const graph = createGraph({
      nodes: [{ id: 'parent' }, { id: 'child', parentId: 'parent' }],
    });

    expect(() => getLayeredLayout(graph)).toThrow(UnsupportedLayoutError);
  });

  it('breaks cycles without consuming the JavaScript call stack', () => {
    const nodeCount = 20_000;
    const graph = createGraph({
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        id: `n${index}`,
      })),
      edges: Array.from({ length: nodeCount }, (_, index) => ({
        id: `e${index}`,
        sourceId: `n${index}`,
        targetId: `n${(index + 1) % nodeCount}`,
      })),
    });
    const result = breakCyclesWithDepthFirstSearch({
      graph,
      sizes: new Map(),
      direction: 'down',
      spacing: { node: 40, layer: 60 },
    });

    expect(result.reversedEdgeIds.size).toBe(1);
  });
});

describe('getLayout', () => {
  it('returns graph patches, diagnostics, and phase timings', async () => {
    const result = await getLayout({ graph: createDiamond() });

    expect(result.patches.length).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.metrics.phases.map((phase) => phase.id)).toEqual([
      'cycle-breaking',
      'layer-assignment',
      'crossing-minimization',
      'node-placement',
      'edge-routing',
    ]);
  });

  it('exposes unsupported layout scopes explicitly', async () => {
    const graph = createDiamond();
    const previous = getLayeredLayout(graph);

    await expect(
      getLayout({
        graph,
        scope: { mode: 'partial', previous, nodeIds: ['b'] },
      }),
    ).rejects.toThrow('does not support partial layout yet');
  });

  it('supports AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop'));

    await expect(
      getLayout({ graph: createDiamond(), signal: controller.signal }),
    ).rejects.toThrow('stop');
  });
});
