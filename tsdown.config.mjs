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
  external: ["@statelyai/graph", "@statelyai/graph/layout"],
});
