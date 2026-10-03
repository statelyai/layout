# Feedback helper self-port comparisons

Parity remains incomplete. On model-order seed 2 RIGHT, real ELK's initial helper comparator invokes its port comparator with the **same physical port on both sides**. The comparator returns **+1** for the shared WEST output ports on n1 and n5. Native's transitive comparator returns **0** immediately for equal keys. Three observed calls differ: one on n1, two on n5. [Real observations](./worker-observations.json), [native observations](./native-observations.json).

This is deliberate upstream behavior, despite ordinary comparator reflexivity expectations. ELK creates a fresh port comparator while comparing source-feedback helpers. WEST/SOUTH reverse outgoing model order; even equal edge orders follow the comparator's directional tie branch. That decision reverses helpers attached to the same output port. Native's zero result erases the decision. This explains a concrete discrepancy in the initial pass; it does not establish the sole cause of final routing differences.

The combined initial state still differs: preprocessing placement, helper insertion order, physical port order and helper-node comparison branches must agree together. Moving the model-order pass before north/south insertion without preserving that complete state is insufficient.

Five production trials were rejected and restored. Complete differences against real ELK, from a starting 32:

| Trial                                               | Differences |
| --------------------------------------------------- | ----------: |
| Earlier initial pass, existing helper comparator    |         220 |
| Earlier pass plus shared-source node ties           |         267 |
| Earlier pass plus complete feedback-helper branches |         220 |
| Above plus self-port tie behavior                   |         219 |
| Self-port behavior alone in the current pipeline    |         217 |

[Verification](./verification.json) preserves every differing value, not just counts. Replaying restored production returns the original 32 differences and exactly the same public output. Adding the real-worker observer also preserves its complete output exactly. Production source and tests are unchanged; syntax, selected formatting and lint checks pass. Previous broad parity measurements therefore remain authoritative, with no claimed gain here.

<!-- diagnostic command from scripts/parity/trace-routing-worker.mjs -->

Reproduce reference observations:

```sh
node scripts/parity/trace-routing-worker.mjs docs/heuristics/inverted-port-model-order/report.json .scratch/seed2-port-self.json 1
```

Read `modelPortSelfEvents` for the three calls. Native observations came from a temporary log at the equal-key return in `transitiveComparator`; that log was removed, and complete output was replayed afterward.

Next: carry original port order and helper creation/adjacency state through the initial pass, then compare both node and port decisions against the worker before rerunning broad random geometry gates. Do not retain isolated changes merely because a comparator trace improves while public layouts regress.
