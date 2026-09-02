import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackResult = { filename: string };
type PackageJson = { exports: Record<string, unknown> };

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkedExports = new Set([".", "./elkjs", "./layered", "./lib/elk.bundled.js"]);

async function main(): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(join(rootDir, "package.json"), "utf8"),
  ) as PackageJson;
  const publishedExports = Object.keys(packageJson.exports).filter(
    (key) => key !== "./package.json",
  );
  const missing = publishedExports.filter((key) => !checkedExports.has(key));
  const stale = [...checkedExports].filter((key) => !publishedExports.includes(key));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `Package smoke coverage mismatch: missing ${missing.join(", ") || "none"}; stale ${stale.join(", ") || "none"}`,
    );
  }

  const packOutput = execFileSync("npm", ["pack", "--json", "--ignore-scripts"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const jsonStart = packOutput.indexOf("[");
  const jsonEnd = packOutput.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error(`Unable to parse npm pack output:\n${packOutput}`);
  }
  const [{ filename }] = JSON.parse(packOutput.slice(jsonStart, jsonEnd + 1)) as PackResult[];
  const tarballPath = join(rootDir, filename);
  const tempDir = await mkdtemp(join(tmpdir(), "statelyai-layout-smoke-"));
  const consumerDir = join(tempDir, "consumer");

  try {
    await mkdir(consumerDir, { recursive: true });
    await writeFile(
      join(consumerDir, "package.json"),
      `${JSON.stringify(
        {
          name: "layout-smoke-consumer",
          private: true,
          type: "module",
          packageManager: "pnpm@10.28.2",
        },
        null,
        2,
      )}\n`,
    );
    execFileSync(
      "corepack",
      ["pnpm", "add", "--ignore-workspace", tarballPath, "@statelyai/graph@^2.1.0"],
      {
        cwd: consumerDir,
        stdio: "inherit",
      },
    );
    execFileSync(
      "corepack",
      ["pnpm", "add", "--ignore-workspace", "--save-dev", "typescript@^5.9.3"],
      {
        cwd: consumerDir,
        stdio: "inherit",
      },
    );

    const runtimePath = join(consumerDir, "check.mjs");
    await writeFile(
      runtimePath,
      `import assert from "node:assert/strict";
import { createGraph } from "@statelyai/graph";
import { getBoxLayout, getLayeredLayout, getRandomLayout } from "@statelyai/layout";
import ELK from "@statelyai/layout/elkjs";
import BundledELK from "@statelyai/layout/lib/elk.bundled.js";
import { getLayeredLayout as getLayeredLayoutFromSubpath } from "@statelyai/layout/layered";
const graph = createGraph({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ id: "ab", sourceId: "a", targetId: "b" }] });
assert.equal(getLayeredLayout(graph).nodes.length, 2);
assert.equal(getBoxLayout(graph).nodes.length, 2);
assert.equal(getRandomLayout(graph, { seed: 1 }).nodes.length, 2);
assert.equal(getLayeredLayoutFromSubpath(graph).edges.length, 1);
const legacy = await new ELK().layout({ id: "root", children: [{ id: "a" }, { id: "b" }], edges: [{ id: "ab", sources: ["a"], targets: ["b"] }] });
assert.equal(legacy.children?.length, 2);
assert.equal((await new BundledELK().layout({ id: "root" })).id, "root");
`,
    );
    execFileSync("node", [runtimePath], { cwd: consumerDir, stdio: "inherit" });

    const typesPath = join(consumerDir, "check.ts");
    await writeFile(
      typesPath,
      `import { createGraph } from "@statelyai/graph";
import { getBoxLayout, getLayeredLayout, getRandomLayout, type LayoutResult } from "@statelyai/layout";
import ELK, { type ElkNode } from "@statelyai/layout/elkjs";
import BundledELK from "@statelyai/layout/lib/elk.bundled.js";
import { type LayeredLayoutOptions } from "@statelyai/layout/layered";
const graph = createGraph({ nodes: [{ id: "a" }], edges: [] });
const options: LayeredLayoutOptions = { direction: "right" };
getLayeredLayout(graph, options).nodes[0]?.id;
getBoxLayout(graph, { aspectRatio: 1.3 }).nodes[0]?.id;
getRandomLayout(graph, { seed: 1 }).nodes[0]?.id;
const request: Promise<ElkNode> = new ELK().layout({ id: "root" });
const bundledRequest: Promise<ElkNode> = new BundledELK().layout({ id: "root" });
void request;
void bundledRequest;
const result = undefined as unknown as LayoutResult;
void result;
`,
    );
    execFileSync(
      "corepack",
      [
        "pnpm",
        "exec",
        "tsc",
        "--noEmit",
        "--moduleResolution",
        "bundler",
        "--module",
        "preserve",
        "--target",
        "esnext",
        "--strict",
        "--skipLibCheck",
        typesPath,
      ],
      { cwd: consumerDir, stdio: "inherit" },
    );
    console.log("Package smoke test passed");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(tarballPath, { force: true });
  }
}

await main();
