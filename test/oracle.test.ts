import { createGraph } from '@statelyai/graph';
import { getElkLayout } from '@statelyai/graph/layout/elk';
import { describe, expect, it } from 'vitest';
import { getLayeredLayout } from '../src';

describe('elkjs oracle', () => {
  it('agrees on the flow direction and output entities for a simple DAG', async () => {
    const graph = createGraph({
      id: 'oracle-dag',
      nodes: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
        { id: 'c', width: 80, height: 40 },
      ],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    const native = getLayeredLayout(graph, { direction: 'right' });
    const oracle = await getElkLayout(graph, {
      algorithm: 'layered',
      direction: 'right',
    });
    const x = (layout: typeof native, id: string) =>
      layout.nodes.find((node) => node.id === id)?.x ?? Number.NaN;

    expect(native.nodes.map((node) => node.id)).toEqual(
      oracle.nodes.map((node) => node.id),
    );
    expect(x(native, 'a')).toBeLessThan(x(native, 'b'));
    expect(x(native, 'b')).toBeLessThan(x(native, 'c'));
    expect(x(oracle, 'a')).toBeLessThan(x(oracle, 'b'));
    expect(x(oracle, 'b')).toBeLessThan(x(oracle, 'c'));
    expect(native.edges.every((edge) => (edge.points?.length ?? 0) >= 2)).toBe(
      true,
    );
    expect(oracle.edges.every((edge) => (edge.points?.length ?? 0) >= 2)).toBe(
      true,
    );
  });
});
