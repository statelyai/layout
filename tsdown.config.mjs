import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/elkjs/index.ts",
    "src/elkjs/main.ts",
    "src/elkjs/worker-api.ts",
    "src/elkjs/worker.ts",
    "src/layered/index.ts",
  ],
  dts: true,
  format: ["esm", "cjs"],
  cjsDefault: true,
  clean: true,
  // The solver is ESM-only; bundle it to preserve CommonJS consumers.
  noExternal: ["@lume/kiwi"],
  external: ["@statelyai/graph", "@statelyai/graph/layout"],
});
