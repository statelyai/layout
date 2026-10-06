import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/parity/**/*.test.ts"] },
});
