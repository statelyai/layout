import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// A non-terminating sweep blocks the event loop, so vitest's own timeout could
// never fire; run the layout in a child process that is killed at the limit.
it("terminates ONE_SIDED hierarchical greedy switching in compound layouts", () => {
  const script = `
    import { compoundOptionsFixture } from "./scripts/parity/compound-options-corpus.ts";
    import NativeELK from "./src/elkjs/index.ts";
    const input = compoundOptionsFixture(3, "RIGHT");
    input.layoutOptions["elk.layered.crossingMinimization.greedySwitchHierarchical.type"] = "ONE_SIDED";
    const result = await new NativeELK().layout(input);
    console.log(result.children.length);
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      timeout: 30000,
    },
  );
  expect(child.signal).toBeNull();
  expect(child.stderr).toBe("");
  expect(Number(child.stdout.trim())).toBeGreaterThan(0);
}, 60000);
