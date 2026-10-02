# Native routing repair measurements

Same 30 inputs and scorer as the frozen initial baseline. Source: `719ccfa642bae891ce1b95ff620e15c5885db5e9`. All 30 native layouts return finite orthogonal routes with no measured missing routes, leaf-node penetrations, unrelated node overlaps, label collisions, edge/label penetrations, or self-retracing outside terminal regions. These geometric checks permit border contact and shared tracks; visual readability is not established.

| Native metric     | Initial baseline | After repair |
| ----------------- | ---------------: | -----------: |
| nodeHits          |              2.0 |          0.0 |
| labelNodeOverlaps |              2.0 |          0.0 |
| selfRetraceLength |             14.0 |          0.0 |
| edgeCrossings     |           2320.0 |       2336.0 |
| edgeOverlapLength |          11697.9 |      10642.4 |
| bends             |           4043.0 |       4107.0 |
| routeLength       |         841858.8 |     842162.8 |

Crossings and bends increase slightly while shared track length decreases. Correct loop geometry can add bends. A proposed two-bend shortcut and adjacent label exit were rejected because they increased corpus crossings. ELK still wins crossings on 23 of 29 paired layouts and bends on 26; parity remains unproven. ELK fails on seed 20261102 / graph 9, retained below. These observed seeds are regression coverage, not future holdouts.

# Detailed Stately / ELK comparison

Source: `719ccfa642bae891ce1b95ff620e15c5885db5e9`; elkjs 0.11.1. 30 graphs; seeds 20261001, 20261102, 20261203. Review seed: 20261001; other seeds are fresh evaluation samples, not sealed holdouts after this run.

All metrics use the same geometry scorer. Lower is better; no combined score or parity claim. Missing/error layouts are reported separately, never dropped or resampled.

| Metric            | Stately better | Tied | ELK better |
| ----------------- | -------------: | ---: | ---------: |
| missingNodes      |              0 |   29 |          0 |
| missingRoutes     |              0 |   29 |          0 |
| nonFinite         |              0 |   29 |          0 |
| diagonals         |              0 |   29 |          0 |
| nodeHits          |              0 |   29 |          0 |
| nodeOverlaps      |              0 |   29 |          0 |
| labelNodeOverlaps |              0 |   29 |          0 |
| labelOverlaps     |              0 |   29 |          0 |
| edgeLabelHits     |              8 |   21 |          0 |
| selfRetraceLength |             14 |   15 |          0 |
| edgeCrossings     |              6 |    0 |         23 |
| edgeOverlapLength |             28 |    0 |          1 |
| bends             |              3 |    0 |         26 |
| routeLength       |             23 |    0 |          6 |
| area              |             26 |    0 |          3 |

Per-graph values below are Stately / ELK.

| Seed / graph  | Node hits | Label-node overlaps | Crossings | Shared track length |     Bends |        Route length |                   Area |
| ------------- | --------: | ------------------: | --------: | ------------------: | --------: | ------------------: | ---------------------: |
| 20261001 / 1  |     0 / 0 |               0 / 0 |     1 / 0 |               0 / 4 |   28 / 14 |         1728 / 1876 |        257346 / 367164 |
| 20261001 / 2  |     0 / 0 |               0 / 0 |     9 / 1 |         128 / 820.5 |   54 / 39 |       7470.7 / 7736 |      743632.5 / 933000 |
| 20261001 / 3  |     0 / 0 |               0 / 0 |   18 / 12 |         34.5 / 1074 |  101 / 49 |      10544.1 / 9877 |      1142603 / 1353597 |
| 20261001 / 4  |     0 / 0 |               0 / 0 |   22 / 12 |          77.5 / 831 |  117 / 69 |   11667.3 / 16918.5 |      1515888 / 2003898 |
| 20261001 / 5  |     0 / 0 |               0 / 0 |   69 / 67 |      259.7 / 3597.7 | 207 / 126 |   31882.5 / 48488.5 |      2966952 / 4334148 |
| 20261001 / 6  |     0 / 0 |               0 / 0 |    10 / 0 |             0 / 285 |   61 / 39 |       5546.4 / 5121 |      493133.3 / 571350 |
| 20261001 / 7  |     0 / 0 |               0 / 0 |   36 / 62 |        112 / 3357.3 |  106 / 97 |   18220.8 / 28333.8 |    1161160 / 2935075.5 |
| 20261001 / 8  |     0 / 0 |               0 / 0 |  172 / 38 |          52 / 204.5 | 190 / 127 |     45247.3 / 37299 |    2450466.7 / 2139930 |
| 20261001 / 9  |     0 / 0 |               0 / 0 | 201 / 388 |      135.5 / 9133.5 | 239 / 274 |  64417.8 / 120841.0 |   4150876.8 / 10413112 |
| 20261001 / 10 |     0 / 0 |               0 / 0 | 258 / 133 |         2185 / 8430 | 278 / 270 |    83151.8 / 112739 |    5668867.5 / 6306045 |
| 20261102 / 1  |     0 / 0 |               0 / 0 |     2 / 0 |           22 / 1106 |   33 / 24 |         2592 / 2939 |      228148.5 / 265974 |
| 20261102 / 2  |     0 / 0 |               0 / 0 |     5 / 2 |              9 / 68 |   47 / 35 |         3690 / 7096 |        534040 / 505890 |
| 20261102 / 3  |     0 / 0 |               0 / 0 |   19 / 12 |       68.5 / 1863.8 |   98 / 52 |   12046.1 / 12140.8 |    1102610.5 / 1386504 |
| 20261102 / 4  |     0 / 0 |               0 / 0 |   13 / 12 |          56 / 597.5 |  110 / 59 |   12796.5 / 14175.7 |      1667611 / 1972596 |
| 20261102 / 5  |     0 / 0 |               0 / 0 |   83 / 71 |      238.5 / 9473.1 | 228 / 150 |   36242.2 / 51491.7 |    4484517.5 / 5552778 |
| 20261102 / 6  |     0 / 0 |               0 / 0 |    21 / 4 |             8 / 859 |   64 / 42 |       8432.8 / 9130 |      589390.3 / 726425 |
| 20261102 / 7  |     0 / 0 |               0 / 0 |   28 / 30 |         35 / 6205.5 |   94 / 87 |   15855.5 / 31588.5 |    1211522.7 / 3065682 |
| 20261102 / 8  |     0 / 0 |               0 / 0 |   69 / 20 |        478 / 3802.0 |  166 / 95 |   30404.5 / 37886.3 |    1773485.3 / 2713724 |
| 20261102 / 9  |     error |               error |     error |               error |     error |               error |                  error |
| 20261102 / 10 |     0 / 0 |               0 / 0 | 346 / 159 |    5332.8 / 10096.3 | 315 / 270 | 102423.8 / 129216.0 |    5393362.7 / 7601330 |
| 20261203 / 1  |     0 / 0 |               0 / 0 |     1 / 2 |           75.5 / 12 |   29 / 13 |     2931.3 / 2367.5 |      262146.5 / 301268 |
| 20261203 / 2  |     0 / 0 |               0 / 0 |    16 / 4 |          63 / 782.3 |   60 / 44 |     5299.2 / 6425.4 |        575340 / 630506 |
| 20261203 / 3  |     0 / 0 |               0 / 0 |   16 / 10 |       100.5 / 916.5 |  104 / 53 |      8075.7 / 10333 |       762012 / 1056419 |
| 20261203 / 4  |     0 / 0 |               0 / 0 |    19 / 9 |           17 / 2452 |  122 / 62 |   15336.9 / 17219.5 |    1860901.3 / 2910144 |
| 20261203 / 5  |     0 / 0 |               0 / 0 |  107 / 76 |       46.2 / 2423.5 | 226 / 135 |     44045.1 / 42922 |    3474919.5 / 3903795 |
| 20261203 / 6  |     0 / 0 |               0 / 0 |    10 / 2 |          12 / 144.8 |   49 / 39 |     7944.5 / 7742.5 |        900900 / 597091 |
| 20261203 / 7  |     0 / 0 |               0 / 0 |   29 / 57 |        303 / 3981.5 |  105 / 95 |   18162.8 / 28040.5 |    1164712.5 / 3239879 |
| 20261203 / 8  |     0 / 0 |               0 / 0 |   69 / 26 |          54 / 778.5 | 148 / 105 |   31817.4 / 36722.5 |  2038446.7 / 2420697.5 |
| 20261203 / 9  |     0 / 0 |               0 / 0 | 193 / 342 |       494.8 / 14987 | 261 / 263 |  57441.3 / 150301.5 | 3003575.3 / 12215897.5 |
| 20261203 / 10 |     0 / 0 |               0 / 0 | 360 / 143 |         83.3 / 5600 | 264 / 293 |    90538.0 / 124342 |    4895410.2 / 6274845 |

Layout failures:

- 20261102/9: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 2 hierarchical ports, but found only 0.
