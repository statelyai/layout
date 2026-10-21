import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ROUTING_BROWSER_MODULE ?? "@playwright/test");
const root = resolve(process.argv[2] ?? ".scratch/routing-quality-pass");
const before = JSON.parse(readFileSync(join(root, "baseline/routes.json"), "utf8"));
const after = JSON.parse(readFileSync(join(root, "after/routes.json"), "utf8"));
const baselineMetadata = JSON.parse(readFileSync(join(root, "baseline/metadata.json"), "utf8"));
const afterMetadata = JSON.parse(readFileSync(join(root, "after/metadata.json"), "utf8"));
const identity = (records) =>
  records.map(({ id, graph, settings, strategy }) => ({ id, graph, settings, strategy }));
assert.deepEqual(identity(after), identity(before), "Matched inputs required");
const output = join(root, "comparison");
mkdirSync(output, { recursive: true });
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const cards = after.map((record, i) => {
  const previous = before[i];
  const x = Math.min(previous.frame.x, record.frame.x);
  const y = Math.min(previous.frame.y, record.frame.y);
  const width =
    Math.max(previous.frame.x + previous.frame.width, record.frame.x + record.frame.width) - x;
  const height =
    Math.max(previous.frame.y + previous.frame.height, record.frame.y + record.frame.height) - y;
  const svg = (item, stage) => {
    const body = item.body
      .replaceAll('id="arrow"', `id="arrow-${stage}-${i}"`)
      .replaceAll("url(#arrow)", `url(#arrow-${stage}-${i})`);
    const value = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="760" height="470">${body}</svg>`;
    writeFileSync(join(output, `${record.id}-${stage}.svg`), value);
    return value;
  };
  return `<article id="${record.id}"><h2>${escape(record.title)}</h2><p>${escape(record.description)}</p><div class="pair"><section><h3>Before · ${escape(baselineMetadata.revision.slice(0, 12))}</h3>${svg(previous, "before")}</section><section><h3>After · ${escape(afterMetadata.revision.slice(0, 12))}</h3>${svg(record, "after")}</section></div></article>`;
});
const html = (body) =>
  `<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#f7f8fb;color:#27334a;font:15px system-ui}h2{margin:8px 0}p{margin:6px 0}.pair{display:flex;gap:12px}section{background:white;border:1px solid #ccd3df}h3{margin:10px 16px}svg{display:block}article{margin-bottom:24px;break-inside:avoid}</style>${body}`;
writeFileSync(join(output, "index.html"), html(cards.join("")));
for (let i = 0; i < cards.length; i += 3)
  writeFileSync(join(output, `page-${i / 3 + 1}.html`), html(cards.slice(i, i + 3).join("")));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = {
  baselineRevision: baselineMetadata.revision,
  sourceRevision: afterMetadata.revision,
  deviceScaleFactor: 1,
  pairCanvas: { width: 760, height: 470 },
  matchedCases: after.length,
  screenshots: [],
  stories: [],
};
try {
  await page.goto(pathToFileURL(join(output, "index.html")).href);
  await page.evaluate(() => document.fonts.ready);
  for (const record of after) {
    const filename = `${record.id}.png`;
    await page.locator(`article[id="${record.id}"]`).screenshot({ path: join(output, filename) });
    report.screenshots.push(filename);
  }
  for (let i = 0; i < cards.length; i += 3) {
    await page.goto(pathToFileURL(join(output, `page-${i / 3 + 1}.html`)).href);
    await page.screenshot({ path: join(output, `page-${i / 3 + 1}.png`), fullPage: true });
  }
  const server = process.env.ROUTING_STORYBOOK_URL;
  if (server) {
    const index = await (await fetch(`${server}/index.json`)).json();
    const stories = Object.values(index.entries).filter(
      (entry) => entry.type === "story" && /^(routing-policies|routing-quality)--/.test(entry.id),
    );
    assert(stories.length >= 48);
    for (const story of stories) {
      await page.goto(`${server}/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator("path[data-edge]").first().waitFor({ state: "attached" });
      const paths = await page
        .locator("path[data-edge]")
        .evaluateAll((paths) =>
          paths.map((p) => ({ d: p.getAttribute("d"), length: p.getTotalLength() })),
        );
      assert(
        paths.every(
          (p) => p.d && !/NaN|Infinity/.test(p.d) && Number.isFinite(p.length) && p.length > 0,
        ),
        story.id,
      );
      report.stories.push({ id: story.id, paths: paths.length });
    }
    await page.goto(`${server}/iframe.html?id=routing-policies--playground&viewMode=story`, {
      waitUntil: "domcontentloaded",
    });
    const example = page.getByRole("combobox", { name: "Example", exact: true });
    await example.selectOption("midpoint");
    const status = page.getByRole("status");
    await status.filter({ hasText: "Revision 0" }).waitFor();
    const labelPosition = () =>
      page
        .locator('[data-label="edge"] rect')
        .evaluate((r) => [r.getAttribute("x"), r.getAttribute("y")]);
    const original = await labelPosition();
    await page.getByRole("button", { name: "Move source", exact: true }).click();
    await status.filter({ hasText: "Revision 1" }).waitFor();
    assert.notDeepEqual(await labelPosition(), original, "Passive label follows a source edit");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await status.filter({ hasText: "Revision 0" }).waitFor();
    assert.deepEqual(await labelPosition(), original);
    const node = page.locator('[data-node="a"] rect');
    const initialNode = await node.getAttribute("x");
    const box = await node.boundingBox();
    assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(await node.getAttribute("x"), initialNode, "Dragging edits the real graph");
    await page.getByText("Policy controls", { exact: true }).click();
    for (const kind of ["polyline", "bezier", "catmull-rom", "rounded-orthogonal"]) {
      await page.getByRole("combobox", { name: "Curve family", exact: true }).selectOption(kind);
      assert((await page.locator("path[data-edge]").count()) > 0);
    }
    await page
      .getByRole("combobox", { name: "Endpoint tangents", exact: true })
      .selectOption("border-normal");
    await page.getByRole("combobox", { name: "Label mode", exact: true }).selectOption("gap");
    await page
      .getByRole("combobox", { name: "Stability", exact: true })
      .selectOption("preserve-valid");
    await page.getByRole("spinbutton", { name: "Crossing penalty", exact: true }).fill("200");
    await example.selectOption("incremental-moves");
    await page.getByRole("button", { name: "Move obstacle", exact: true }).click();
    await status.filter({ hasText: "Revision 1" }).waitFor();
    assert.match(await status.textContent(), /1 recomputed · 1 reused/);
    report.interactions = {
      passiveLabelMove: true,
      reset: true,
      drag: true,
      curveFamilies: 4,
      policyControls: true,
      obstacleUpdate: await status.textContent(),
    };
    await page.screenshot({ path: join(output, "storybook-interaction.png"), fullPage: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(root, "quality-browser-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      matchedCases: report.matchedCases,
      screenshots: report.screenshots.length,
      stories: report.stories.length,
    }),
  );
} finally {
  await browser.close();
}
