# Stately / ELK baseline

Source: `ceef0b107cee294e10f1538ee9f9cea67b43e255` (working tree includes baseline tooling changes); elkjs 0.11.1. 20 graphs; seeds 2223741271, 4699967. Review seed: 20261001; other seeds are fresh evaluation samples, not sealed holdouts after this run.

All metrics use the same geometry scorer. Lower is better; no combined score or parity claim. Missing/error layouts are reported separately, never dropped or resampled.

| Metric            | Stately better | Tied | ELK better |
| ----------------- | -------------: | ---: | ---------: |
| missingNodes      |              0 |   17 |          0 |
| missingRoutes     |              0 |   17 |          0 |
| nonFinite         |              0 |   17 |          0 |
| diagonals         |              0 |   17 |          0 |
| nodeHits          |              0 |   17 |          0 |
| nodeOverlaps      |              0 |   17 |          0 |
| labelNodeOverlaps |              0 |   17 |          0 |
| labelOverlaps     |              0 |   17 |          0 |
| edgeLabelHits     |              7 |   10 |          0 |
| selfRetraceLength |              7 |   10 |          0 |
| edgeCrossings     |              2 |    1 |         14 |
| edgeOverlapLength |             16 |    0 |          1 |
| bends             |              2 |    0 |         15 |
| routeLength       |             15 |    0 |          2 |
| area              |             14 |    0 |          3 |

Per-graph values below are Stately / ELK.

| Seed / graph    | Node hits | Label-node overlaps | Crossings | Shared track length |     Bends |        Route length |                  Area |
| --------------- | --------: | ------------------: | --------: | ------------------: | --------: | ------------------: | --------------------: |
| 2223741271 / 1  |     0 / 0 |               0 / 0 |     4 / 0 |              0 / 68 |   28 / 13 |       1880.5 / 2282 |       293480 / 334640 |
| 2223741271 / 2  |     0 / 0 |               0 / 0 |    10 / 0 |            29 / 877 |   65 / 32 |     8017.5 / 5974.5 |     630840 / 614778.5 |
| 2223741271 / 3  |     0 / 0 |               0 / 0 |    25 / 9 |         30.5 / 2032 |   94 / 60 |   12102.8 / 14059.5 |    936355 / 1628389.5 |
| 2223741271 / 4  |     0 / 0 |               0 / 0 |    7 / 12 |         61 / 1521.3 |  109 / 68 |   10254.7 / 18712.3 |     1552290 / 2226945 |
| 2223741271 / 5  |     0 / 0 |               0 / 0 |  139 / 73 |        231 / 7678.8 | 290 / 143 |   43674.8 / 51520.3 |   2494188.5 / 6967032 |
| 2223741271 / 6  |     0 / 0 |               0 / 0 |    14 / 1 |          12 / 183.5 |   64 / 37 |       7906.0 / 7559 |       653796 / 520128 |
| 2223741271 / 7  |     error |               error |     error |               error |     error |               error |                 error |
| 2223741271 / 8  |     0 / 0 |               0 / 0 |   80 / 27 |       89.7 / 1078.5 | 163 / 110 |   29354.5 / 40637.5 |     2057287 / 2983874 |
| 2223741271 / 9  |     error |               error |     error |               error |     error |               error |                 error |
| 2223741271 / 10 |     0 / 0 |               0 / 0 | 383 / 119 |      908.5 / 8867.1 | 278 / 297 |  94664.9 / 137901.1 |   4891562.2 / 6720760 |
| 4699967 / 1     |     0 / 0 |               0 / 0 |     1 / 1 |            498 / 70 |    8 / 11 |       1925.5 / 2213 |     202866.5 / 269568 |
| 4699967 / 2     |     0 / 0 |               0 / 0 |    12 / 3 |       93.5 / 2079.5 |   54 / 37 |       5843.5 / 6138 |     695713.5 / 544548 |
| 4699967 / 3     |     0 / 0 |               0 / 0 |    18 / 7 |           74 / 2081 |   85 / 56 |    9807.5 / 13673.5 |     1052230 / 1654299 |
| 4699967 / 4     |     0 / 0 |               0 / 0 |   13 / 10 |       130.5 / 654.5 |  119 / 63 |   11707.5 / 14946.5 |     1782729 / 2110185 |
| 4699967 / 5     |     0 / 0 |               0 / 0 |   94 / 55 |      431.6 / 4035.7 | 230 / 131 |   43063.1 / 46557.7 |     4923234 / 5765408 |
| 4699967 / 6     |     0 / 0 |               0 / 0 |     5 / 2 |             37 / 73 |   49 / 35 |     4227.5 / 7437.5 |       563958 / 726768 |
| 4699967 / 7     |     error |               error |     error |               error |     error |               error |                 error |
| 4699967 / 8     |     0 / 0 |               0 / 0 |   73 / 45 |         34 / 3135.3 | 169 / 125 |   33134.2 / 38805.3 | 1643180.0 / 2275943.5 |
| 4699967 / 9     |     0 / 0 |               0 / 0 | 104 / 174 |      581.7 / 2438.8 | 223 / 221 |     45445.0 / 79598 |  3210835.0 / 10035894 |
| 4699967 / 10    |     0 / 0 |               0 / 0 | 424 / 144 |       200 / 12224.3 | 358 / 270 | 101214.6 / 104139.7 |   5058530 / 5321400.5 |

Parity gate: **FAIL**. Native geometry invariants pass on every graph; crossings and bends no worse than real ELK on each graph; oracle failures remain unverified. 32 failed checks. This finite sample does not prove universal graph parity.

Layout failures:

- 2223741271/7: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 5 hierarchical ports, but found only 0.
- 2223741271/9: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 9 hierarchical ports, but found only 0.
- 4699967/7: Stately OK; ELK Error: java.lang.IllegalStateException: Expected 3 hierarchical ports, but found only 0.
