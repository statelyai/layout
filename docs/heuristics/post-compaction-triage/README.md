# Post-compaction triage

After the orthogonal edge-list fix, layer-axis differences under post-compaction looked like the largest ordinary-graph class. Triage shows most of it is not native divergence.

**Non-finite oracle output.** 38 failing cases have NaN coordinates in real ELK's output (serialized as `null`). All use post-compaction (`LEFT`, `LEFT_RIGHT_CONSTRAINT_LOCKING` or `LEFT_RIGHT_CONNECTION_LOCKING`). Native output stays finite, so these cannot match and are reported separately, like oracle errors. `scripts/parity/summarize-reports.mjs` now counts them as `elkNonFinite`.

**Compaction-only divergence.** Rerunning each failing compaction case without its compaction option ([compaction-only.json](compaction-only.json)) leaves 34 that match ELK exactly without compaction. Only 10 of those have finite ELK output. They are ELK compaction quirks rather than one shared cause:

- Degenerate self loops (source and target are the same port): ELK's compaction graph omits them. It moves endpoints with the node and leaves bends at their pre-compaction coordinates. Native's pre-compaction coordinates differ from ELK's even where final node positions agree, so matching needs pre-compaction fidelity. Simply leaving bends in place makes these four cases worse; not shipped.
- Edge segments that ELK compacts beyond the nodes' extent (directional-fresh seed 58 RIGHT/LEFT).
- One label coordinate (seed 69 RIGHT/LEFT).

**Next lead outside compaction.** Nine cases differ only in fixed-side port positions after a north/south port switches side. ELK re-sorts ports stably by side in canonical (rightward) coordinates, so a switched port follows its clockwise rank within its new side. Matching needs that rule in both port placement and routing anchors, applied per direction. A placement-only trial fixed port positions for RIGHT and DOWN but not route endpoints, and broke LEFT; not shipped.

Corpus status at this point (1,280 cases): 746 exact, 217 oracle errors, 38 non-finite oracle outputs, 279 remaining failures (141 compound, 138 ordinary or model-order).
