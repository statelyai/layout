---
"@statelyai/layout": patch
---

Preserve state separation for fixed-port fan-out, remove cycles reintroduced by port preferences, and keep inline center labels between endpoint ranks. Preserve label space during horizontal compaction, reserve exterior inline self-loop labels, and keep compound-to-descendant labels clear of headers. Allow initial states to have self-loops. Includes captured Viz regressions and the email drafter in all four directions.
