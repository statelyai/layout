import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  server: {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 4173,
    allowedHosts: [".localhost"],
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dist-demo"),
    emptyOutDir: true,
  },
});
