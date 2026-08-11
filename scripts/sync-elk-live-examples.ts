import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";

const ELK_MODELS_REVISION = "ac5af2ba511c0037e4f347e8bd91f013950951c7";
const TREE_URL = `https://api.github.com/repos/eclipse/elk-models/git/trees/${ELK_MODELS_REVISION}?recursive=1`;
const RAW_ROOT = `https://raw.githubusercontent.com/eclipse/elk-models/${ELK_MODELS_REVISION}`;
const CONVERSION_URL =
  "https://rtsys.informatik.uni-kiel.de/elklive/conversion?inFormat=elkt&outFormat=json";
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type TreeResponse = { tree: { path: string; type: string }[] };

function section(source: string, marker: string, nextMarker?: string): string {
  const startMarker = `// elkex:${marker}`;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing ${startMarker}`);
  const contentStart = start + startMarker.length;
  const end = nextMarker ? source.indexOf(`// elkex:${nextMarker}`, contentStart) : source.length;
  const content = source.slice(contentStart, end < 0 ? source.length : end);
  return content
    .replace(/^\s*\/\*\s*/, "")
    .replace(/\s*\*\/\s*$/, "")
    .trim();
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function main(): Promise<void> {
  const tree = JSON.parse(await fetchText(TREE_URL)) as TreeResponse;
  const paths = tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" && entry.path.startsWith("examples/") && entry.path.endsWith(".elkt"),
    )
    .map((entry) => entry.path)
    .sort();

  const examples = await Promise.all(
    paths.map(async (path) => {
      const source = await fetchText(`${RAW_ROOT}/${path}`);
      const graphSource = section(source, "graph");
      const graph = JSON.parse(
        await fetchText(CONVERSION_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: graphSource,
        }),
      ) as Record<string, unknown>;
      return {
        id: path.slice("examples/".length, -".elkt".length).replaceAll("/", "-"),
        path,
        category: section(source, "category", "label").split(/\s*>\s*/),
        name: section(source, "label", "doc"),
        description: section(source, "doc", "graph"),
        source: graphSource,
        graph,
      };
    }),
  );

  const outputPath = resolve(rootDir, "demo/generated/elk-live-examples.json");
  await mkdir(dirname(outputPath), { recursive: true });
  const serialized = `${JSON.stringify(
    {
      source: "https://github.com/eclipse/elk-models",
      revision: ELK_MODELS_REVISION,
      examples,
    },
    null,
    2,
  )}\n`;
  const formatted = await format(outputPath, serialized);
  if (formatted.errors.length) throw new Error("Unable to format the ELK Live example catalog");
  await writeFile(outputPath, formatted.code);
  console.log(`Synced ${examples.length} ELK Live examples at ${ELK_MODELS_REVISION}`);
}

await main();
