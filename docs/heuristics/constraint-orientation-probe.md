# Constraint orientation probe

Ten retained graphs from seed 130363. This probe ran with the constraint
orientation and label-approach changes later committed as `6354d43`, before
the subsequent fixed-endpoint repair. Raw provenance records pre-commit HEAD
`f913778` and a dirty working tree. It is a development probe, not a sealed
holdout or parity claim. The previous 160-graph report remains unchanged.

The smallest case improves from six crossings to one, and from 27 bends to 26. Several larger cases regress. All ten native layouts have zero measured
geometry violations; ELK fails on graph 9, which remains unverified. The strict
parity gate fails. Preserve these regressions in subsequent replays.

# Stately / ELK baseline

Source: `f913778e2fb2d9126f9e744b933e2de5e97ab4db` (working tree includes baseline tooling changes); elkjs 0.11.1. 10 graphs; seeds 130363. Review seed: 20261001; other seeds are fresh evaluation samples, not sealed holdouts after this run.

All metrics use the same geometry scorer. Lower is better; no combined score or parity claim. Missing/error layouts are reported separately, never dropped or resampled.

| Metric            | Stately better | Tied | ELK better |
| ----------------- | -------------: | ---: | ---------: |
| missingNodes      |              0 |    9 |          0 |
| missingRoutes     |              0 |    9 |          0 |
| nonFinite         |              0 |    9 |          0 |
| diagonals         |              0 |    9 |          0 |
| nodeHits          |              0 |    9 |          0 |
| nodeOverlaps      |              0 |    9 |          0 |
| labelNodeOverlaps |              0 |    9 |          0 |
| labelOverlaps     |              0 |    9 |          0 |
| edgeLabelHits     |              2 |    7 |          0 |
| selfRetraceLength |              3 |    6 |          0 |
| edgeCrossings     |              2 |    0 |          7 |
| edgeOverlapLength |              9 |    0 |          0 |
| bends             |              1 |    0 |          8 |
| routeLength       |              7 |    0 |          2 |
| area              |              6 |    0 |          3 |

Per-graph values below are Stately / ELK.

| Seed / graph | Node hits | Label-node overlaps | Crossings | Shared track length |     Bends |       Route length |                Area |
| ------------ | --------: | ------------------: | --------: | ------------------: | --------: | -----------------: | ------------------: |
| 130363 / 1   |     0 / 0 |               0 / 0 |     1 / 0 |          39.3 / 155 |   26 / 16 |      1632.5 / 2201 |     238854 / 383656 |
| 130363 / 2   |     0 / 0 |               0 / 0 |     4 / 2 |            36 / 192 |   56 / 32 |    4881.5 / 4912.5 |     633842 / 623238 |
| 130363 / 3   |     0 / 0 |               0 / 0 |   12 / 15 |          53 / 749.5 |  103 / 53 |   9267.9 / 11171.5 |  879786 / 1156187.5 |
| 130363 / 4   |     0 / 0 |               0 / 0 |   34 / 11 |        59.3 / 585.2 |  136 / 64 |  12857.5 / 14273.2 | 1194872 / 1784945.5 |
| 130363 / 5   |     0 / 0 |               0 / 0 |  131 / 71 |          157 / 3958 | 278 / 144 |  49815.8 / 46242.7 | 4281852.5 / 6965434 |
| 130363 / 6   |     0 / 0 |               0 / 0 |    16 / 3 |           8 / 522.5 |   60 / 39 |    7544.7 / 7086.5 |     688534 / 489062 |
| 130363 / 7   |     0 / 0 |               0 / 0 |   15 / 27 |           52 / 2252 |  114 / 88 |    13569.2 / 17628 |   1397750 / 2442917 |
| 130363 / 8   |     0 / 0 |               0 / 0 |  113 / 28 |         27 / 3517.7 | 183 / 130 |  32455.2 / 37998.6 | 1984892.7 / 2141988 |
| 130363 / 9   |     error |               error |     error |               error |     error |              error |               error |
| 130363 / 10  |     0 / 0 |               0 / 0 | 403 / 144 |       688 / 13937.7 | 270 / 298 | 90511.2 / 130265.5 | 5956134.7 / 5876178 |

Parity gate: **FAIL**. Native geometry invariants pass on every graph; crossings and bends no worse than real ELK on each graph; oracle failures remain unverified. 16 failed checks. This finite sample does not prove universal graph parity.

Layout failures:

- 130363/9: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 5 hierarchical ports, but found only 0.
