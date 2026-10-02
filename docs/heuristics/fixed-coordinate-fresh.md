# Stately / ELK baseline

Source: `bc4e7e2694e013b2f17d0d1a08c863e25e8767d9`; elkjs 0.11.1. 10 graphs; seeds 1495461400. Review seed: 20261001; other seeds are fresh evaluation samples, not sealed holdouts after this run.

All metrics use the same geometry scorer. Lower is better; no combined score or parity claim. Missing/error layouts are reported separately, never dropped or resampled.

| Metric            | Stately better | Tied | ELK better |
| ----------------- | -------------: | ---: | ---------: |
| missingNodes      |              0 |   10 |          0 |
| missingRoutes     |              0 |   10 |          0 |
| nonFinite         |              0 |   10 |          0 |
| diagonals         |              0 |   10 |          0 |
| nodeHits          |              0 |   10 |          0 |
| nodeOverlaps      |              0 |   10 |          0 |
| labelNodeOverlaps |              0 |   10 |          0 |
| labelOverlaps     |              0 |   10 |          0 |
| edgeLabelHits     |              6 |    4 |          0 |
| selfRetraceLength |              4 |    6 |          0 |
| edgeCrossings     |              2 |    1 |          7 |
| edgeOverlapLength |             10 |    0 |          0 |
| bends             |              1 |    0 |          9 |
| routeLength       |              8 |    0 |          2 |
| area              |              9 |    0 |          1 |

Per-graph values below are Stately / ELK.

| Seed / graph    | Node hits | Label-node overlaps | Crossings | Shared track length |     Bends |        Route length |                 Area |
| --------------- | --------: | ------------------: | --------: | ------------------: | --------: | ------------------: | -------------------: |
| 1495461400 / 1  |     0 / 0 |               0 / 0 |     1 / 1 |          18 / 162.5 |   36 / 16 |         2234 / 2301 |      263120 / 283746 |
| 1495461400 / 2  |     0 / 0 |               0 / 0 |     5 / 2 |           9 / 322.8 |   52 / 28 |     5358.8 / 4120.3 |    575600.3 / 587505 |
| 1495461400 / 3  |     0 / 0 |               0 / 0 |    17 / 4 |        156.5 / 1297 |   99 / 47 |     8199.4 / 8379.5 |    1038751 / 1033032 |
| 1495461400 / 4  |     0 / 0 |               0 / 0 |    17 / 6 |       40.9 / 1060.3 |  113 / 66 |   12119.9 / 12379.2 |  1362289.5 / 2921080 |
| 1495461400 / 5  |     0 / 0 |               0 / 0 |  186 / 95 |      786.8 / 6255.4 | 250 / 144 |   55437.6 / 49989.9 |    4647447 / 4750677 |
| 1495461400 / 6  |     0 / 0 |               0 / 0 |     8 / 3 |              0 / 56 |   65 / 34 |     6771.6 / 7280.5 |      551383 / 751100 |
| 1495461400 / 7  |     0 / 0 |               0 / 0 |   45 / 49 |       65.5 / 1519.2 | 127 / 105 |   17300.3 / 28729.8 |    1299925 / 3034328 |
| 1495461400 / 8  |     0 / 0 |               0 / 0 |  120 / 27 |      399.8 / 2252.5 | 186 / 136 |     32662.8 / 46006 |  1925957.5 / 2408080 |
| 1495461400 / 9  |     0 / 0 |               0 / 0 | 183 / 375 |        129 / 8771.5 | 241 / 295 |  59470.5 / 129869.2 | 2932148.3 / 10533824 |
| 1495461400 / 10 |     0 / 0 |               0 / 0 | 442 / 182 |    3221.5 / 13642.2 | 330 / 288 | 105770.8 / 140225.5 |  6366307.5 / 7189100 |

Parity gate: **FAIL**. Native geometry invariants pass on every graph; crossings and bends no worse than real ELK on each graph; oracle failures remain unverified. 16 failed checks. This finite sample does not prove universal graph parity.
