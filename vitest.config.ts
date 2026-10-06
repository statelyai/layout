import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exact-ELK parity tests run with `pnpm test:parity:oracle`; layout quality is the default bar.
    exclude: [...configDefaults.exclude, "test/parity/**"],
  },
});
