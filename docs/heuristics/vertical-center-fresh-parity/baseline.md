# Stately / ELK baseline

Source: `683f94972c37f13f64b1c4251258151874319f24` (uncommitted native label/inverted-port phase and importer correction); elkjs 0.11.1. 10 graphs; seeds 3468112780. Review seed: 20261001; other seeds are fresh evaluation samples, not sealed holdouts after this run.

All metrics use the same geometry scorer. Lower is better; no combined score or parity claim. Missing/error layouts are reported separately, never dropped or resampled.

| Metric            | Stately better | Tied | ELK better |
| ----------------- | -------------: | ---: | ---------: |
| missingNodes      |              0 |    8 |          0 |
| missingRoutes     |              0 |    8 |          0 |
| nonFinite         |              0 |    8 |          0 |
| diagonals         |              0 |    8 |          0 |
| nodeHits          |              0 |    8 |          0 |
| nodeOverlaps      |              0 |    8 |          0 |
| labelNodeOverlaps |              0 |    8 |          0 |
| labelOverlaps     |              0 |    8 |          0 |
| edgeLabelHits     |              5 |    3 |          0 |
| selfRetraceLength |              3 |    5 |          0 |
| edgeCrossings     |              0 |    0 |          8 |
| edgeOverlapLength |              7 |    0 |          1 |
| bends             |              0 |    0 |          8 |
| routeLength       |              8 |    0 |          0 |
| area              |              7 |    0 |          1 |

Per-graph values below are Stately / ELK.

| Seed / graph    | Node hits | Label-node overlaps | Crossings | Shared track length |     Bends |      Route length |                Area |
| --------------- | --------: | ------------------: | --------: | ------------------: | --------: | ----------------: | ------------------: |
| 3468112780 / 1  |     0 / 0 |               0 / 0 |     4 / 0 |          18 / 112.5 |   35 / 13 |   2522.5 / 3117.5 |     219558 / 239693 |
| 3468112780 / 2  |     0 / 0 |               0 / 0 |     9 / 3 |        90.5 / 658.5 |   53 / 38 |       6126 / 7023 |   626480 / 671856.5 |
| 3468112780 / 3  |     0 / 0 |               0 / 0 |   13 / 10 |          21 / 267.5 |   96 / 50 | 10815.2 / 11058.5 |   1178019 / 1079670 |
| 3468112780 / 4  |     0 / 0 |               0 / 0 |    12 / 8 |         55 / 1521.5 |  109 / 67 | 11328.8 / 12930.3 | 1602937.5 / 1904985 |
| 3468112780 / 5  |     0 / 0 |               0 / 0 | 113 / 110 |        197 / 8083.2 | 262 / 184 | 54222.8 / 58857.5 |   5869155 / 6096312 |
| 3468112780 / 6  |     0 / 0 |               0 / 0 |    10 / 3 |             17 / 16 |   46 / 30 |     5658.8 / 8093 |     628047 / 917700 |
| 3468112780 / 7  |     error |               error |     error |               error |     error |             error |               error |
| 3468112780 / 8  |     0 / 0 |               0 / 0 |   86 / 37 |        131.5 / 1072 | 177 / 137 |   41567.7 / 45138 | 2276042.7 / 2673931 |
| 3468112780 / 9  |     error |               error |     error |               error |     error |             error |               error |
| 3468112780 / 10 |     0 / 0 |               0 / 0 | 408 / 125 |     213.2 / 12029.5 | 303 / 274 |  97710.8 / 125266 | 5896198.7 / 7172227 |

Parity gate: **FAIL**. Native geometry invariants pass on every graph; crossings and bends no worse than real ELK on each graph; oracle failures remain unverified. 18 failed checks. This finite sample does not prove universal graph parity.

Layout failures:

- 3468112780/7: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 5 hierarchical ports, but found only 0.
- 3468112780/9: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 1 hierarchical ports, but found only 0.

Source hashes captured before execution and rechecked afterward are in `source-manifest.json`. This is failed parity evidence for the local phase, not a clean shipped revision. Every fresh draw, input, output and oracle error remains preserved.
