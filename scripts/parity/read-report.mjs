import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
// Sparse reports retain complete historical failures through their baseline chain.
export function readReport(path, seen = new Set()) {
  const absolute = resolve(path);
  if (seen.has(absolute)) throw new Error("Cyclic parity report baseline");
  seen.add(absolute);
  const raw = fs.readFileSync(absolute);
  const data = JSON.parse((absolute.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
  if (Array.isArray(data.rows)) return data;
  if (typeof data.baseline !== "string" || !Array.isArray(data.updates))
    throw new Error("Expected complete rows or baseline with indexed updates");
  const base = readReport(resolve(dirname(absolute), data.baseline), seen);
  const rows = [...base.rows];
  const indices = new Set();
  for (const update of data.updates) {
    if (
      !Number.isInteger(update.index) ||
      update.index < 0 ||
      update.index >= rows.length ||
      indices.has(update.index)
    )
      throw new Error("Invalid parity report update index");
    if (JSON.stringify(rows[update.index].input) !== JSON.stringify(update.row.input))
      throw new Error("Parity report update changes the preserved input");
    indices.add(update.index);
    rows[update.index] = update.row;
  }
  return { ...base, ...data, rows };
}
