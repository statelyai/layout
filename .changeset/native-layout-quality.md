---
"@statelyai/layout": minor
---

Native layered layout reaches layout quality at or above real ELK (elkjs 0.11.1) on the retained and holdout corpora, with zero hard defects on the corpus, and gains layout hints and geometry constraints on graphs with containers.

- Support geometry constraints on graphs with containers: containers move and grow with their children, siblings never overlap, and only edges touching moved geometry are re-routed.
- Add layout hints: `hint.anchor` places a node at the start or end of its container, `hint.chain` aligns sequential nodes on one center line, and `statechartHints(graph)` derives both from a statechart. Preferred hints are kept only when the layout is no worse without them; hints never create defects.
- Add an optional synchronous replacement router to layered layout. Initial layout
  still computes placement and routes; replacement routing discards those routes
  and preserves finalized node, port, label, and compound geometry.
- Preserve ELK's BK alignment history when deciding which blocks may straighten same-layer edges. This corrects placement and connected routes for singleton blocks.
- Skip hidden self loops in Brandes-Koepf edge straightening, as ELK does.
- Count same-layer and north/south port crossings when selecting layered candidates and evaluating two-sided greedy swaps. Use hyperedge estimates for sweeps and edge-pair counts for swaps, improving fixed-position port layouts.
- Use canonical physical-port ranks and barycenter distribution during native layered sweeps. Reuse connectivity across layers and preserve fixed port orders and hierarchical port constraints.
- Repair native layered edge routing through nodes, misplaced compound ports,
  parent/child return connections, and retraced label/self-loop sections. Preserve
  feasible orthogonal paths when preferred clearances or soft route reservations
  cannot be satisfied, while retaining bounded search and conflict diagnostics.

  Repair label-only collisions, reserve port exit corridors, orient same-port loops
  outward, and prevent terminal retracing in narrow or fractional-coordinate gaps.

- Retain both physical endpoints when restoring a cross-port route collapsed to one coordinate. Prevent diagonal compound-edge segments caused by losing the opposite boundary anchor.
- Fall back to the uncompacted layout when post-compaction would route edges through nodes.
- Fall back from post-compaction that folds a route back onto itself.
- Treat sub-tolerance floating-point offsets along rectangle boundaries as boundary travel during routing. Prevent ancestor-to-child routes from falling back to diagonals when content normalization differs from child coordinates by a few ulps.
- Lay out compound graphs with several crossing-minimization candidates and keep the best measured result.
- Run the two-sided greedy switch by default for INCLUDE_CHILDREN layouts, reducing compound edge crossings.
- Preserve authored compound port constraints when preparing hierarchy boundary helpers, and transform their layer placement with the layout direction.
- Join compound route pieces with an elbow instead of a diagonal when boundary anchors disagree.
- Preserve junction points from child scopes when joining native cross-hierarchy routes, including their coordinate offsets and source-to-target order.
- Preserve compound-port identity, geometry, and authored constraints when routing ancestor edges. Keep child-scope edge coordinates out of parent normalization and retain inactive boundary ports through crossing minimization.
- Use cycle-broken edge directions when locking nodes during layered connection-based compaction, preserving the physical graph's sinks and sources.
- Edge labels with a width and height but no text reserve layout space again in the elkjs facade. This differs from ELK, which ignores them.
- Replay ELK per-port edge lists (reversal history, label dummies, hierarchy segments) when seeding crossing minimization.
- Move complete collinear exterior tracks during inline-label separation, including retained long-edge dummy junctions. Prevent diagonal segments when labels require another lane.
- Route self-loops between fixed port faces around their owner's perimeter, respect physical port extents, and reserve north clearance only for loops using that side.
- Respect fixed-position port order and preserve seeded random state between cycle breaking and crossing minimization, route long orthogonal paths with a Manhattan A* heuristic, fit retry leads into subpixel corridors, preserve spacing around unrelated nodes during port-side alignment, and repair label intersections and retraced flat routes.

  Process layer and whole-node feedback constraints before cycle breaking, preserve implicit fixed endpoint sides through reversal, and reserve the final endpoint approach while routing a labeled edge's first leg.

  Preserve initial fixed implicit endpoint faces during flat routing repair, including corner attachments.

  Preserve fixed implicit endpoint coordinates during repair without exposing synthetic ports, and prevent route search from retracing its own terminal leads.

  Insert native same-layer inverted-port dummies before crossing minimization and route their orthogonal segments in the matching side corridor.

- Match ELK's greedy sweep traversal by scanning the starting layer once before converging later layers. This preserves the same adjacent-node swap sequence and repairs seeded model-order geometry differences.
- Decide greedy crossing switches with ELK's local two-node crossing estimates.
- Fix physical compound boundary-port sides during native hierarchy preparation and normalize fixed-side port sorting for layout direction. Preserve authored compound options in the returned graph. Expand strict real-ELK regressions, retaining remaining hierarchy routing and constraint failures.
- Merge hyperedge dummies only when ELK import would detect a hyperedge.
- Keep northern and southern hierarchical port helpers at the ends of their layers, as ELK does.
- Route inverted same-layer ports through canonical orthogonal channels, including exterior boundaries and cycle-broken direction. Preserve occupied-layer clearance, degenerate self-loop corners during compaction, and junction ownership.
- Preserve original edge model-order values on segments created for inverted fixed-side ports, matching ELK's property inheritance instead of comparing generated-edge indices.
- Fix layout regressions found against the previous release:

  - HEAD and TAIL edge labels no longer cover nodes, other labels or routes; they move beside their route near their endpoint.
  - A nested graph's own `elk.direction` wins over its parent's.
  - Free ports on reversed edges no longer reserve margin on the wrong side.
  - MODEL_ORDER cycle breaking orders layer-constrained boundary nodes first or last, so routes inside compounds stop detouring.
  - Fixed-side self-loops on zero-size ports take their own slot instead of landing on a sibling port.
  - Free ports are ordered with elkjs's exact sort, so tied ports and center labels no longer swap; the Viz two-state cycle matches ELK again.
  - Routes of labeled and long edges follow their endpoints when post-compaction moves nodes.

- Reserve clearance on both sides of orthogonal routing tracks beside label layers, keeping label-terminal bends separate from label boundaries before compaction.
- Pair center-label dummies with adjacent long-edge dummies of the same endpoints when choosing label sides, as ELK does.
- Seed layered crossing minimization in ELK LongEdgeSplitter order, using authored port order.
- Retain exterior self-loop label clearance in native compaction hitboxes.
- Include fixed self-loop envelopes in orthogonal routing ranks. Preserve target-side track clearance through trailing horizontal bends and cycle reversal, preventing unrelated routes from merging with a loop's outer track during compaction.
- Retain helper-node cross-axis extents during native layered placement so ELK-compatible graph bounds account for actual dummy thickness and port-helper sizes.
- Route in-layer edges kept by merged hyperedge dummies through their dummy port sides.
- Route a merged inverted-port dummy's in-layer edge in the adjacent channel, as ELK does.
- Clamp layered edge-to-edge spacing to ELK's minimum of two pixels, reserving space between long-edge tracks even when configured below that minimum.
- Retain ordinary long-edge cross-axis bounds in graphs containing self-loops without adding that allowance to loop or label envelopes.
- Assign orthogonal junction ownership using retained physical incident-edge order, and preserve branch junctions when restoring fixed non-flow ports shared by incoming and outgoing edges.
- Interpolate unknown barycenters during the preserved initial model-order attempt instead of randomizing them. Retain each hierarchy scope's initial-order flag and prescribed external-port order during crossing sweeps.
- Prepare initial model order before north/south helper insertion, retain physical port and incident-edge order through crossing minimization, and match ELK's feedback-helper tie decisions. Exclude port and label helpers from Brandes-Koepf inner-segment conflict detection, improving native node placement and routes.
- Preserve canonical physical-port ordering when applying model-order node constraints, recompute flexible port ranks after node reordering, and allow forced model-order layouts to use greedy crossing reduction.
- Reserve exterior self-loop label clearance before placement and preserve directional label alignment and stacked routing clearance.
- Coordinate native compatibility hierarchy crossing sweeps before placement,
  refresh parent dimensions and ports from finished children, and preserve the
  selected port order through routing. Align NetworkSimplex traversal with port
  order and correct Brandes-Koepf alignment for parallel edges and a shared physical
  port. Preserve fixed anchors on mixed explicit/implicit self-loops, their occupied
  sides and endpoint ownership when deriving bounds and junctions. Restore constrained nodes before long-edge splitting, preserve ancestor-first
  implicit port creation, and publish clockwise input boundary port order. Native
  hierarchical layout and routing parity remains incomplete. Select BK straightening
  edges through physical port order and apply ELK spacing to tagged external
  boundary dummies.

  Apply BK straightening thresholds during compaction, with completed-block state
  and deferred retries within available space. Preserve random flat failures in a
  new reproducible corpus covering ports, cycles, self-loops and labels.

  Count selected physical ports during native greedy switching and exclude
  self-loop connectivity from crossing sweep ranks. Broad parity remains incomplete.

  Select parallel alignment connections independently from the current node's
  clockwise ports in both BK sweep directions.

  Reserve movable implicit orthogonal loop envelopes during BK placement and
  transform canonical loop routes by direction. Exclude restored loop ports from
  ordinary flow ranks; retain the existing inline-label and fixed-port phases.

- Preserve explicit native boundary-port identity and selected descendant route
  endpoints in compound layouts. Inherit child layout directions and score
  statechart reading order using inherited direction, retaining explicit overrides.
  Add the native ELK external-port dummy model and source-equivalent factory tests.
  General hierarchical layout and routing parity remains incomplete.
- Sort initial model-order nodes and physical ports before crossing minimization, retain authored edge order through label and long-edge expansion, and apply forced node priority during barycenter sweeps. Match initial-attempt selection and model-weighted crossing selection to ELK 0.11.1.
- Generate orthogonal junctions on native physical hypersegments before endpoint restoration and long-edge joining. Preserve junction ownership and coordinates through compaction and serialization, including same-layer inverted-port links. Use actual fixed-order port anchors during segment construction.
- Integrate native label, inverted-port and north/south-port phases with crossing constraints and grouped edge-length compaction. Join long-edge dummies before compaction and restore port routes against the current graph to prevent artificial constraint cycles.
- Reserve fixed self-loop clearance before placement, preserve same-side loop routes and compact loop-owned geometry with rigid port leads. Retain initial finite geometry when compaction constraints are infeasible, and preserve synthetic label order and orthogonal terminal corners.
- Match ELK's critical orthogonal cycle ordering and default crossing attempts. Preserve the shared random state through greedy switching and graph phase copies so routing selects the same detour edge.
- Port ELK's complete orthogonal segment splitting, regular-cycle removal and track numbering. Use logical flow for LEFT/UP routing so endpoint roles and mirrored tracks match the native segment engine.
- Preserve measured helper extents through nested compound normalization, correcting container bounds and dependent parent placement/routing.
- Report the correct container for edges routed inside a nested compound, such as an edge from a compound port to its own child.
- Move north/south ports to the side their dummy reached during crossing minimization, as ELK does.
- Keep north/south port dummies beside their node when forced model order separates them.
- Speed up ELK option lookup in the elkjs facade. Compound layouts with many elements run 15 to 20 times faster.
- Assign orthogonal junction points and hyperedge segments in ELK port edge-list order.
- Match ELK shared-port orthogonal hypersegment grouping and crossing counts, and emit native junction metadata.
- Join route sections orthogonally in `GraphEdge.points`, so labeled compound routes never contain diagonal segments.
- Route hierarchical boundary ports through native constraint, sizing and restoration phases. Preserve their coordinate scope, compound bounds and physical port sides through crossing and export.
- Preserve physical hierarchy port order independently of feedback-edge direction, avoiding incomplete boundary-order errors in nested cyclic graphs.
- Preserve physical incident edge order when assigning orthogonal junction points after edge reversal.
- Clear protruding ports and routing reservations when placing same-layer tracks in layered layout.
- Visit edges within a port in ELK edge-list order during barycenter crossing minimization.
- Avoid reserving east self-loop space twice when node placement has already included the loop envelope. This keeps hierarchy boundary helpers and their routes in the positions chosen by layout.
- Route same-port self loops as small squares and remove route spurs, so orthogonal routes never retrace themselves.
- Retain physical routing order for junction points when joining reversed edge chains.
- Place self-loop labels beside the loop, clear of nodes and other routes, when the default spot would cover the node.
- Preserve incoming physical-port adjacency through long-edge splitting and source-port inversion. Use that order for BK straightening of detached cross-port rows, retaining phase metadata through label preparation.
- Route self loops that share a port on one track, as ELK hyperloops do.
- Correct smart center-label port anchors during vertical layered layout by transposing the default selection before choosing sides in canonical coordinates.
