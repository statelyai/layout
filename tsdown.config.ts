import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/layered/index.ts'],
  dts: true,
  format: ['esm'],
  clean: true,
  external: ['@statelyai/graph', '@statelyai/graph/layout'],
});
