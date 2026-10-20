import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ROUTING_BROWSER_MODULE ?? "@playwright/test");
const root = resolve(process.argv[2] ?? ".scratch/routing-policies");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1768, height: 1170 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = { viewport: { width: 1768, height: 1170 }, scale: 1, stages: [], live: [] };
try {
  const fixtures = [];
  for (const stage of ["before", "after"]) {
    const directory = join(root, stage);
    const records = JSON.parse(readFileSync(join(directory, "routes.json"), "utf8"));
    fixtures.push(records.map((record) => ({ id: record.id, graph: record.fixture })));
    await page.goto(pathToFileURL(join(directory, "index.html")).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await page.locator("article[data-fixture]").count(), 9);
    const paths = await page
      .locator("path[data-edge]")
      .evaluateAll((paths) =>
        paths.map((path) => ({ d: path.getAttribute("d"), length: path.getTotalLength() })),
      );
    assert(paths.length >= 9, `${stage} omitted a fixture route`);
    for (const path of paths) {
      assert(path.d && !/NaN|Infinity/.test(path.d));
      assert(Number.isFinite(path.length) && path.length > 0);
    }
    await page.screenshot({ path: join(directory, "gallery.png"), fullPage: true });
    report.stages.push({ stage, fixtures: records.length, paths: paths.length });
  }
  assert.deepEqual(fixtures[0], fixtures[1], "Before/after inputs must match exactly");
  if (process.env.ROUTING_STORYBOOK_URL) {
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.goto(
      `${process.env.ROUTING_STORYBOOK_URL}/iframe.html?id=routing-policies--playground&viewMode=story`,
    );
    const selector = page.getByRole("combobox", { name: "Example" });
    await selector.waitFor();
    for (const { id } of fixtures[0]) {
      await selector.selectOption(id);
      await page.getByRole("status").filter({ hasText: "Revision 0" }).waitFor();
      const paths = await page
        .locator("path[data-edge]")
        .evaluateAll((paths) =>
          paths.map((path) => ({ d: path.getAttribute("d"), length: path.getTotalLength() })),
        );
      assert(paths.length > 0, `${id} has no visible route`);
      assert(paths.every((path) => path.d && !/NaN|Infinity/.test(path.d) && path.length > 0));
      report.live.push({ id, paths: paths.length });
    }
    await selector.selectOption("midpoint");
    const label = page.locator('[data-label="edge"] rect');
    const original = await label.evaluate((rect) => [
      rect.getAttribute("x"),
      rect.getAttribute("y"),
    ]);
    await page.getByRole("button", { name: "Move source", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Revision 1" }).waitFor();
    const moved = await label.evaluate((rect) => [rect.getAttribute("x"), rect.getAttribute("y")]);
    assert.notDeepEqual(moved, original, "Following label must move with its path");
    report.followingLabelMoved = { original, moved };
  }
  assert.deepEqual(errors, []);
  mkdirSync(root, { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(root, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
