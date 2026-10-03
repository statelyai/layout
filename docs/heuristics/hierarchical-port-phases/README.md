# Hierarchical port phases

Native ports of ELK's perpendicular boundary constraint, dummy sizing and orthogonal post-routing processors are implemented as internal modules. They are **not yet connected to the public layout pipeline**. This is phase fidelity evidence, not complete layout parity.

The frozen JavaRandom seed 912718 generates 128 intermediate graphs per configuration: 2–5 layers, 2–7 ordinary nodes, 1–4 boundary ports, 1–3 incidences per ordinary node, shared ports, disconnected helpers and empty layers. Four constraint modes include FIXED_RATIO. Both uniform and asymmetric padding/offset configurations compare complete layer membership/order, helper dimensions, ports, adjacency, restored ports, bounds, offsets and every edge bend against the unmodified installed ELK worker.

<!-- phase coverage from scripts/check-hierarchical-port-phases.ts and test/hierarchical-port-phases.test.ts -->

**800 / 800 checks pass:** 768 processor comparisons plus 32 direction/congruency/physical-face comparisons. The three regression tests pass. [Full inputs and outputs](report.json.gz) include the worker SHA-256. [Observed UP transformer modes](up-transform-worker.json) preserve the actual worker geometry; the observed output was separately verified equal to uninstrumented ELK.

The real pipeline initially uses `TO_INPUT_DIRECTION`, then finally uses `TO_INTERNAL_LTR`. Applying their static names in the opposite order gives the wrong UP/rotated DOWN perpendicular mapping. The native helper mapping now follows the actual initial processor.

The public ancestor gate was rerun: **224 / 320 exact matches, 1,176 differing values, zero engine exceptions**. All 96 public failures remain strict tests. Public layout behavior has not changed in this step. The preceding retained random gate remains incomplete; it was not rerun because these new modules are not called by public layout.

```sh
pnpm exec tsx scripts/check-hierarchical-port-phases.ts .scratch/hierarchical-port-phases.json.gz
pnpm exec vitest run test/hierarchical-port-phases.test.ts --maxWorkers=1
pnpm exec tsx scripts/check-ancestor-port-parity.ts .scratch/ancestor-ports.json
```

Next: wire constraint preparation before long-edge splitting, sizing after crossing order, and restoration after routing; carry shared RNG, empty layers and coordinate scope through every stage. Verify complete public geometry across all directions before claiming an improvement. East/west strong port ordering, custom anchors/labels, compound ownership and broad random parity remain outstanding.
