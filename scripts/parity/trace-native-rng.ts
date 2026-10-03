import { readFileSync, writeFileSync } from "node:fs";
import NativeELK from "../../src/elkjs";
import { JavaRandom } from "../../src/java-random";

// Development-only observation; delegates every call to the original implementation.
const events: { name: string; result: string }[] = [];
let depth = 0;
for (const name of ["nextLong", "nextDouble", "nextFloat", "nextBoolean"] as const) {
  const original: (this: JavaRandom) => number | boolean | bigint = JavaRandom.prototype[name];
  JavaRandom.prototype[name] = function (this: JavaRandom) {
    const top = depth++ === 0;
    try {
      const result = original.call(this);
      if (top) events.push({ name, result: String(result) });
      return result;
    } finally {
      depth--;
    }
  } as never;
}
const report = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const input = report.rows[Number(process.argv[4] ?? 0)]?.input;
if (!input) throw new Error("Requested report row does not exist");
const output = await new NativeELK().layout(structuredClone(input));
writeFileSync(process.argv[3]!, JSON.stringify({ events, output }, null, 2) + "\n");
