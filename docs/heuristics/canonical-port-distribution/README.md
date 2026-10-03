# Canonical port distribution

The native `CanonicalPortDistributor` implements ELK's physical-port barycenter distribution, node-relative/layer-total ranks, same-layer connections, north/south dummy roles, fixed orders and hierarchy exceptions. State persists across calls. This is an internal foundation; the production sweep adapter remains pending.

The development tracer observes installed real ELK without replacing its algorithms. From each real warm state it runs one native call, then compares physical port order and every rank, barycenter and node position using `Object.is`. **27,670/27,670 calls match across 300 random inputs**: 12,925 calls from 100 flat inputs and 14,745 from 200 directional flat/hierarchical inputs. Six ELK exceptions remain recorded failures. [scores.json](./scores.json) retains outcomes, counts and trace hashes; full traces remain in `.scratch/port-distribution-{flat,directional}.json` and can be regenerated.

Sixty-four representative oracle snapshots test both rank modes, all directions, fixed ports, hierarchy exclusions, same-layer and north/south connections. Fixtures explicitly encode signed zero because JSON otherwise erases it. Assertions compare exact states and port order. The initial native north/south calculation assigned the dummy value directly; ELK adds it to a zero sum. The corrected native code preserves that arithmetic, including signed zero.

The attempted production bridge rebuilt canonical topology for every visited layer. It changed no native outputs across the existing 100 flat and 200 directional inputs, and the existing 30-second ChangeAwareArrayList stress check failed, including an isolated rerun. The adapter was reverted. [Patch](./rejected-integration.patch), [suite result](./rejected-integration-suite.json) and [flat](./integration-flat.json)/[directional](./integration-directional.json) comparisons preserve that evidence. No assertions or timeouts changed.

Full repository suite: **2,746 passed / 101 unchanged failures / 2,847 total**; [suite delta](./suite-delta.json) records no new failures. Source/repository type checks, selected lint/format and package build pass. The build retains its existing mixed-export warning.

Production geometry is unchanged from `293564a`: **47/100 flat, 414/600 combined directional**. Layout parity is incomplete. The next integration must retain physical port topology efficiently, bridge native edge-order state faithfully, and reproduce sweep initialization/restoration before geometry parity can improve. The isolated warm-state proof does not establish whole-layout parity or cold initialization parity.

Reproduce:

```sh
pnpm exec tsx scripts/parity/trace-port-distribution.ts docs/heuristics/canonical-crossing-scores/flat-report.json .scratch/port-distribution-flat.json
pnpm exec tsx scripts/parity/trace-port-distribution.ts docs/heuristics/canonical-crossing-scores/report.json .scratch/port-distribution-directional.json
pnpm exec vitest run test/oracle-port-distribution.test.ts --exclude '.scratch/**' --maxWorkers=4
pnpm exec vitest run --exclude '.scratch/**' --maxWorkers=4
```

The second tracer exits unsuccessfully for its six preserved ELK exceptions even when every observed distribution matches. Production uses native TypeScript; elkjs remains a development oracle.

The subsequent [cached sweep integration](../cached-port-sweeps/README.md) now uses this phase in production and shares canonical ranks with node sorting. The results above describe the earlier foundation checkpoint.
