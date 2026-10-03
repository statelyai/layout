# Cross-side fan-out anchors

BK's fan-out anchor guard grouped ports by logical edge direction. A shared EAST port and a separate SOUTH port can both be outgoing; this incorrectly replaces the physical EAST anchor with edge-count spacing. Fixed-order ports and unique fixed-side ports now use their placed physical anchors. Multiple fixed-side ports retain the crossing sweep's selected order.

Junction reconstruction also marked a singleton north/south endpoint's restored elbow as a branch. Singleton connections now omit junctions; shared-port branches remain unchanged.

All 16 full-geometry cases match real ELK 0.11.1 across four directions, FIXED_SIDE/FIXED_ORDER and zero/four-pixel ports. Archived ea50aa2 fails all 16; current passes all 16. Before/current/oracle inputs and outputs remain in `fixtures/`. `before-after.png` shows the same RIGHT four-pixel fixture at equal scale.

Unchanged random flat corpus: 32/100 complete matches, 10,625 differences (previous 10,896), no errors or lost matches. Hierarchy remains 72/100, 832 differences; fixed-port loops remain 100/100. Broad parity is incomplete.

The separate candidate excluding north/south and label dummies from BK inner-segment conflicts exposed three label-placement regressions. `rejected-candidate-suite.json` preserves those failures. That candidate is not shipped; typed dummy alignment and the downstream label geometry need further diagnosis. Assertions remain unchanged.

Run the random gates with `pnpm test:parity:flat`, `pnpm test:parity:compound`, and `pnpm test:parity:self-loops`. Run tests with `--exclude '.scratch/**'` to exclude archived source trees.

Full suite: 2,247 passed / 106 failed, with zero introduced or resolved failures against ea50aa2. Source/repository types, selected format/lint and package build pass.
