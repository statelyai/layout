import { readReport } from "./read-report.mjs";
import fs from "node:fs";
const [beforeDir, afterDir] = process.argv.slice(2);
const names = [
  "report",
  "fresh-report",
  "flat-report",
  "directional-report",
  "expanded-report",
  "directional-fresh-report",
  "options-report",
  "complex-report",
];
const cat = (p) =>
  /junctionPoints|junctions/.test(p)
    ? "junctions"
    : /labels/.test(p)
      ? "labels"
      : /sections|bendPoints|startPoint|endPoint/.test(p)
        ? "routes"
        : /ports/.test(p)
          ? "ports"
          : /^\$\.(width|height)$/.test(p)
            ? "rootSize"
            : /children/.test(p)
              ? "nodes/hierarchy"
              : "other";
const out = {
  corpora: {},
  total: {
    cases: 0,
    before: 0,
    after: 0,
    gained: 0,
    lost: 0,
    diffsBefore: 0,
    diffsAfter: 0,
    oracleErrors: 0,
    nativeErrorsBefore: 0,
    nativeErrorsAfter: 0,
  },
  categories: {},
  gainedCases: [],
  worsened: 0,
  improved: 0,
  unchangedDiffCount: 0,
};
for (const n of names) {
  const b = readReport(`${beforeDir}/${n}.json`).rows,
    a = readReport(`${afterDir}/${n}.json`).rows;
  const c = {
    cases: b.length,
    before: 0,
    after: 0,
    gained: [],
    lost: [],
    diffsBefore: 0,
    diffsAfter: 0,
    oracleErrors: 0,
  };
  b.forEach((rb, i) => {
    const ra = a[i];
    if (JSON.stringify(rb.input) !== JSON.stringify(ra.input)) throw new Error("input drift");
    if (rb.elk.error) c.oracleErrors++;
    if (rb.equal) c.before++;
    if (ra.equal) c.after++;
    if (!rb.equal && ra.equal) c.gained.push(`${rb.family ?? ""}${rb.seed}${rb.direction}`);
    if (rb.equal && !ra.equal) c.lost.push(`${rb.seed}${rb.direction}`);
    c.diffsBefore += rb.differences.length;
    c.diffsAfter += ra.differences.length;
    if (ra.differences.length < rb.differences.length) out.improved++;
    else if (ra.differences.length > rb.differences.length) out.worsened++;
    for (const [k, rows] of [
      ["before", rb],
      ["after", ra],
    ])
      for (const d of rows.differences) {
        const g = cat(d.path);
        (out.categories[g] ??= { before: 0, after: 0 })[k]++;
      }
    out.total.nativeErrorsBefore += rb.native.error ? 1 : 0;
    out.total.nativeErrorsAfter += ra.native.error ? 1 : 0;
  });
  out.corpora[n] = { ...c, gained: c.gained.length, lost: c.lost.length, lostCases: c.lost };
  out.gainedCases.push(...c.gained.map((x) => `${n}:${x}`));
  for (const k of ["cases", "before", "after", "diffsBefore", "diffsAfter", "oracleErrors"])
    out.total[k] += c[k];
  out.total.gained += c.gained.length;
  out.total.lost += c.lost.length;
}
fs.writeFileSync(`${afterDir}/audit.json`, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      total: out.total,
      categories: out.categories,
      improved: out.improved,
      worsened: out.worsened,
    },
    null,
    1,
  ),
);
for (const [n, c] of Object.entries(out.corpora))
  console.log(
    n.padEnd(18),
    `${c.before}->${c.after}`,
    `+${c.gained}/-${c.lost}`,
    `${c.diffsBefore}->${c.diffsAfter}`,
    `oracleErr ${c.oracleErrors}`,
  );
