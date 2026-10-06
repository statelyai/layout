import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** Reads a gzipped JSON fixture from `test/fixtures`; large corpora are stored compressed. */
// oxlint-disable-next-line typescript/no-explicit-any
export function readFixture<T = any>(name: string): T {
  const raw = readFileSync(new URL(`../fixtures/${name}.json.gz`, import.meta.url));
  return JSON.parse(gunzipSync(raw).toString("utf8")) as T;
}
