# Statechart quality corpus

Real Stately statecharts, laid out with the exact ELK inputs the Stately editor sends. `corpus.json.gz` may be diagnosed. `holdout.json.gz` must never be diagnosed.

## Sources

The capture ran in a throwaway `statelyai/viz` worktree at `262ef323e` (editor on `@statelyai/layout@0.4.3`) with `viz-capture.test.ts.txt`. For every machine, the test:

1. Builds the graph the way the editor and its stories do.
2. Lays out every canvas (`getLayoutParentNodeIds`) with `layoutGraph`, using the default engine (`elk`) and the default `edge-label-grouped` strategy. It does this five times: once without options, then once for each `elk.direction` (DOWN, RIGHT, UP, LEFT).
3. Records every `ELK.prototype.layout` call.

| Source                                                                     | Machines | Calls | Distinct inputs |
| -------------------------------------------------------------------------- | -------: | ----: | --------------: |
| `xstate-v6-corpus`: `xstateV6ProjectCorpus` plus the v6 alpha Omni machine |       10 |   140 |             112 |
| `expression-imports`: the expression-rich and module-scope XState fixtures |        5 |    50 |              36 |
| `large-hierarchical`: the CSE prospect machine                             |        1 |    40 |              32 |
| `magscope`: the Magscope coordinator operations                            |        1 |    10 |               8 |
| `github-routing`: the GitHub routing corpus (AWS ASL, SCXML, bug fixtures) |       33 |   345 |             276 |
| `agent-examples`: the agent example machines                               |       41 |   420 |             328 |
| `scion`: all SCION SCXML examples, converted with `scxmlToGraph`           |      335 | 5,070 |           1,680 |
| `corpus-probes`: `packages/editor/scripts/corpus-probes`                   |        3 |    30 |              24 |
| `fixtures`: statechart fixtures in `stories/fixtures` and `test/fixtures`  |       14 |   195 |             136 |
| Total                                                                      |      443 | 6,300 |           2,632 |

Distinct inputs are counted under the first source that sends them. 552 distinct inputs contain a single node, nearly all of them the root canvas. Those are skipped, which leaves 2,080 rows.

`layoutGraph` snaps sizes to 1/64 px (viz#741), and the corpus keeps whatever it sends. Sizes come from the source where the source has them: espresso-bar's measured sizes, and the saved sizes in babyfood and other XGraph fixtures. Every other size uses the editor's `estimateEntitySizes`, with text measured on a Chromium canvas in Inter Variable. The estimator leaves some entities to the DOM: compound states, descriptions, invokes, and grouped or eventless transitions. Those entities get the estimate of a sanitized copy plus fixed extras, so their sizes approximate the editor's.

## Split

Rows are split by machine: sha256 of `<source>/<machine id>`, first byte even → corpus, odd → holdout. An input shared by several machines belongs to the machine with the smallest key, and it appears only once.

| File              | Machines |  Rows | Oracle errors |
| ----------------- | -------: | ----: | ------------: |
| `corpus.json.gz`  |      235 | 1,116 |            14 |
| `holdout.json.gz` |      208 |   964 |            12 |

Each row has `family` (the source), `seed` (the row index), `direction` (`DEFAULT` means no `elk.direction` option), `machine`, `scope` (the canvas's parent state, or `null` for the root), `uses` (the number of identical calls), `input`, and `elk`. Real elkjs 0.11.1 crashes on some editor inputs, and those rows store `elk: { error }`. The gate counts them as `ORACLE_ERROR`.

## Regenerate

`captured-inputs.json.gz` holds the deduplicated capture: each distinct input with every call that sent it. To regenerate the oracle rows without viz:

```sh
pnpm exec tsx scripts/parity/generate-statechart-corpus.ts docs/heuristics/quality-statecharts
```

Real ELK carries state from one layout to the next in a process. The generator therefore always rebuilds both files in one process, corpus rows first and then holdout rows, in capture order. Rerunning it reproduces both files byte for byte.

To recapture, copy `viz-capture.test.ts.txt` to `packages/editor/src/zz-capture-corpus.test.ts` in a viz worktree. Build the workspace packages the stories import, then run the test:

```sh
pnpm --filter "@statelyai/editor-sync..." --filter "@statelyai/sdk..." run build
CAPTURE_OUT=/tmp/capture.json pnpm exec vitest run --project unit src/zz-capture-corpus.test.ts
```

The playwright Chromium must be installed for the text metrics. Then rebuild everything from the raw capture:

```sh
pnpm exec tsx scripts/parity/generate-statechart-corpus.ts docs/heuristics/quality-statecharts --raw /tmp/capture.json
```

## Baseline (`main` at `00dabcc`)

```sh
pnpm exec tsx scripts/parity/quality-gate.ts corpus.json docs/heuristics/quality-statecharts/corpus.json.gz --jobs 8
pnpm exec tsx scripts/parity/quality-gate.ts holdout.json docs/heuristics/quality-statecharts/holdout.json.gz --jobs 8
```

|                                    | Corpus            | Holdout           |
| ---------------------------------- | ----------------- | ----------------- |
| Cases                              | 1,116             | 964               |
| WIN / TIE / LOSS                   | 32 / 768 / 302    | 31 / 699 / 222    |
| Oracle errors / native errors      | 14 / 0            | 12 / 0            |
| Native / ELK hard-violation cases  | 75 / 18           | 45 / 20           |
| Crossings (native / ELK)           | 221 / 56          | 96 / 12           |
| Edge overlap length (native / ELK) | 4,932 / 0         | 3,800 / 0         |
| Bends (native / ELK)               | 4,412 / 3,424     | 3,299 / 2,520     |
| Route length (native / ELK)        | 691,024 / 642,658 | 451,391 / 415,981 |
| Area (native / ELK)                | 262.8M / 261.1M   | 193.4M / 190.4M   |
