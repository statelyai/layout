import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname),
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dist-demo"),
    emptyOutDir: true,
  },
});
