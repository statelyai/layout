import { hierarchicalPortSides } from "../layered/hierarchical-port-phases";
import { isPerpendicularPortRestored } from "../layered/hierarchical-port-restoration";
import { useBottomUpHierarchySweep } from "../layered/hierarchy-sweepiness";
import {
  createLayeredScopePipeline,
  type LayeredCrossingPhase,
  type LayeredLayoutOptions,
  type LayerOrder,
} from "../layered";
import { createLayerSweepSession } from "../layered/strategies";
import {
  minimizeHierarchyCrossings,
  type HierarchyCrossingScope,
} from "../layered/hierarchy-crossing";
import { transferExternalPort, joinCompoundRouteSegments } from "../layered/compound-boundaries";
import {
  attachExternalPortDummy,
  createExternalPortDummy,
  externalPortDummyOf,
  type ExternalPortConstraints,
  type ExternalPortSide,
} from "../layered/external-port-dummy";
import { isBetterLayout, measureLayout } from "./layout-quality";
import { applyOrthogonalJunctions } from "./orthogonal-junctions";
import { createGraph, type Graph, type VisualGraph } from "@statelyai/graph";
import {
  elkLayeredOptionDefinitions,
  type ElkLayeredOptionValueByName,
  type LayeredAdvancedOptions,
} from "../layered/elk-options";
import { executeElkjs0111Layout } from "../internal/layout-engine";
import { elkjs0111ResultPolicy, type Elkjs0111ResultPolicy } from "../internal/elkjs-compatibility";
import type {
  ElkConstructorArguments,
  ElkLayoutAlgorithmDescription,
  ElkEdge,
  ElkLabel,
  ElkLayoutArguments,
  ElkLayoutCategoryDescription,
  ElkLayoutOptionDescription,
  ElkId,
  ElkNode,
  ElkPoint,
  ElkPort,
  ElkShape,
  LaidOutElkNode,
} from "./types";
import type {
  ElkLayoutArguments as PublicElkLayoutArguments,
  ElkNode as PublicElkNode,
  LaidOutElkNode as PublicLaidOutElkNode,
} from "./public-types";

function isLayoutEdgeLabel(label: ElkLabel): boolean {
  // Unlike ELK, a dimensioned label without text still reserves space: apps often render the text themselves.
  return (
    getBooleanOption(label.layoutOptions ?? {}, "noLayout") !== true &&
    (Boolean(label.text) || label.width !== undefined || label.height !== undefined)
  );
}

export type {
  ELK,
  ELKConstructorArguments,
  ElkCommonDescription,
  ElkEdge,
  ElkEdgeSection,
  ElkExtendedEdge,
  ElkGraphElement,
  ElkLabel,
  ElkLayoutArguments,
  ElkLayoutAlgorithmDescription,
  ElkLayoutCategoryDescription,
  ElkLayoutOptionDescription,
  ElkNode,
  ElkPoint,
  ElkPort,
  ElkPrimitiveEdge,
  ElkShape,
  LayoutOptions,
  LaidOutElkNode,
} from "./public-types";
export type { ElkId, ElkLogging } from "./types";

interface PreparedElkScope {
  graph: ElkNode;
  native: Graph;
  phase?: LayeredCrossingPhase;
  options?: LayeredLayoutOptions;
  children: ReadonlyMap<string, PreparedElkScope>;
  finish(orders?: ReadonlyMap<PreparedElkScope, LayerOrder>): Promise<ElkNode>;
}

export default class ELK {
  readonly #options: ElkConstructorArguments;
  readonly #algorithmIds: ReadonlySet<string>;

  constructor(options: ElkConstructorArguments = {}) {
    this.#options = options;
    this.#algorithmIds = new Set([
      "box",
      "fixed",
      "random",
      "rectpacking",
      "sporeCompaction",
      "sporeOverlap",
      ...(options.algorithms ?? ["layered"]).filter((id) => id === "layered"),
    ]);
  }

  async knownLayoutAlgorithms(): Promise<ElkLayoutAlgorithmDescription[]> {
    return [...this.#algorithmIds].map((id) => ({
      id: id === "layered" ? "org.eclipse.elk.layered" : id,
      name: {
        layered: "Layered",
        box: "Box",
        fixed: "Fixed",
        random: "Random",
        rectpacking: "Rectangle Packing",
        sporeCompaction: "SPOrE Compaction",
        sporeOverlap: "SPOrE Overlap Removal",
      }[id],
      category: id === "layered" ? "layered" : "other",
      knownOptions:
        id === "layered"
          ? elkLayeredOptionDefinitions.map((definition) => definition.elkId)
          : id === "box"
            ? ["padding", "spacing.nodeNode", "aspectRatio", "box.packingMode"]
            : id === "random"
              ? ["padding", "spacing.nodeNode", "aspectRatio", "randomSeed"]
              : ["position", "bendPoints"],
    }));
  }

  async knownLayoutOptions(): Promise<ElkLayoutOptionDescription[]> {
    return [
      { id: "org.eclipse.elk.algorithm", name: "Layout Algorithm", type: "STRING" },
      ...elkLayeredOptionDefinitions.map((definition) => ({
        id: definition.elkId,
        name: definition.name,
        type: definition.type,
        targets: [...definition.targets],
      })),
    ];
  }

  async knownLayoutCategories(): Promise<ElkLayoutCategoryDescription[]> {
    return [
      {
        id: "layered",
        name: "Layered",
        knownLayouters: this.#algorithmIds.has("layered") ? ["layered"] : [],
      },
      { id: "other", name: "Other", knownLayouters: ["box", "fixed", "random"] },
    ];
  }

  terminateWorker(): void {}

  layout<T extends PublicElkNode>(
    graph: T,
    arguments_?: PublicElkLayoutArguments,
  ): Promise<PublicElkNode & PublicLaidOutElkNode<T>>;
  layout<T extends ElkNode>(graph: T, arguments_?: ElkLayoutArguments): Promise<LaidOutElkNode<T>>;
  async layout<T extends ElkNode>(
    graph: T,
    arguments_: ElkLayoutArguments = {},
  ): Promise<LaidOutElkNode<T>> {
    const options = { ...this.#options.defaultLayoutOptions, ...arguments_.layoutOptions };
    const variants = crossingVariants(options, graph);
    const pristine = variants.length ? structuredClone(graph) : undefined;
    let best = await this.#layoutWithoutDefectiveCompaction(graph, arguments_);
    if (!pristine) return best;
    // A compound layout with defects tries other random seeds and keeps the
    // best measured result. Above ELK's default thoroughness, every compound
    // layout does, trading time for fewer crossings and bends.
    let quality = measureLayout(best);
    if (quality.defects === 0 && !thorough(options, graph)) return best;
    for (const variant of variants) {
      const candidate = await this.#layoutWithoutDefectiveCompaction(structuredClone(pristine), {
        ...arguments_,
        layoutOptions: { ...arguments_.layoutOptions, ...variant },
      });
      const candidateQuality = measureLayout(candidate);
      if (isBetterLayout(candidateQuality, quality)) {
        best = candidate;
        quality = candidateQuality;
      }
    }
    return best;
  }

  async #layoutWithoutDefectiveCompaction<T extends ElkNode>(
    graph: T,
    arguments_: ElkLayoutArguments,
  ): Promise<LaidOutElkNode<T>> {
    const compacting = usesPostCompaction(
      { ...this.#options.defaultLayoutOptions, ...arguments_.layoutOptions },
      graph,
    );
    const pristine = compacting ? structuredClone(graph) : undefined;
    const result = await this.#layout(graph, arguments_);
    const defects = pristine ? measureLayout(result).defects : 0;
    if (!pristine || defects === 0) return result;
    // Post-compaction is an optimization; it must not route edges through nodes
    // or fold a route back onto itself.
    const strategy = { "elk.layered.compaction.postCompaction.strategy": "NONE" };
    const uncompacted = await this.#layout(disablePostCompaction(pristine), {
      ...arguments_,
      layoutOptions: { ...arguments_.layoutOptions, ...strategy },
    });
    return measureLayout(uncompacted).defects < defects ? uncompacted : result;
  }

  async #layout<T extends ElkNode>(
    graph: T,
    arguments_: ElkLayoutArguments = {},
    compoundLayout = false,
  ): Promise<LaidOutElkNode<T>> {
    const prepared = await this.#prepareLayout(graph, arguments_, compoundLayout);
    const orders = coordinatePreparedScopes(prepared);
    return (await prepared.finish(orders)) as LaidOutElkNode<T>;
  }

  async #prepareLayout<T extends ElkNode>(
    graph: T,
    arguments_: ElkLayoutArguments = {},
    compoundLayout = false,
  ): Promise<PreparedElkScope> {
    const startedAt = performance.now();
    if (graph === undefined || graph === null) {
      throw new TypeError("Missing mandatory parameter: graph");
    }
    if (
      typeof graph.id !== "string" &&
      !(typeof graph.id === "number" && Number.isInteger(graph.id))
    ) {
      throw new TypeError("Graph id must be a string or integer");
    }
    delete graph.logging;
    const layoutOptions = {
      ...this.#options.defaultLayoutOptions,
      ...arguments_.layoutOptions,
      ...graph.properties,
      ...graph.layoutOptions,
    };
    // Programmatic incremental metadata is accepted by ELK but is neither
    // serialized by elkjs nor geometry-affecting during a normal layout.
    void getOption(layoutOptions, "debugMode");
    void getOption(layoutOptions, "interactiveLayout");
    void getOption(layoutOptions, "layered.generatePositionAndLayerIds");
    void getOption(layoutOptions, "topdown.scaleFactor");
    void getOption(layoutOptions, "contentAlignment");
    for (const child of graph.children ?? []) {
      const childOptions = child.layoutOptions ?? {};
      void getOption(childOptions, "layered.layering.layerId");
      void getOption(childOptions, "layered.crossingMinimization.positionId");
      void getOption(childOptions, "layered.layering.layerChoiceConstraint");
      void getOption(childOptions, "layered.crossingMinimization.positionChoiceConstraint");
      void getOption(childOptions, "layered.crossingMinimization.inLayerPredOf");
      void getOption(childOptions, "layered.crossingMinimization.inLayerSuccOf");
      void getOption(childOptions, "topdown.scaleFactor");
      void getOption(childOptions, "layered.considerModelOrder.groupModelOrder.componentGroupId");
      for (const port of child.ports ?? []) {
        void getOption(
          port.layoutOptions ?? {},
          "layered.considerModelOrder.groupModelOrder.componentGroupId",
        );
      }
    }
    for (const edge of graph.edges ?? []) {
      void getOption(
        edge.layoutOptions ?? {},
        "layered.considerModelOrder.groupModelOrder.componentGroupId",
      );
    }
    const requestedAlgorithm = String(getOption(layoutOptions, "algorithm") ?? "layered");
    const algorithm = requestedAlgorithm.replace(/^(?:org\.eclipse\.)?elk\./, "");
    if (
      algorithm !== "layered" &&
      algorithm !== "box" &&
      algorithm !== "fixed" &&
      algorithm !== "random" &&
      algorithm !== "rectpacking" &&
      algorithm !== "sporeCompaction" &&
      algorithm !== "sporeOverlap"
    ) {
      throw new Error(
        `org.eclipse.elk.core.UnsupportedConfigurationException: Layout algorithm '${requestedAlgorithm}' not found`,
      );
    }
    const preparedChildren = new Map<string, PreparedElkScope>();
    const finishChildren: Array<() => Promise<void>> = [];
    const hasHierarchy = (graph.children ?? []).some((child) => (child.children?.length ?? 0) > 0);
    const insideSelfLoopBaseHeightByNodeId = new Map<string, number>();
    const hierarchyRestorations: Array<{
      edge: ElkEdge;
      sources?: ElkId[];
      targets?: ElkId[];
      source?: ElkId;
      target?: ElkId;
    }> = [];
    const boundaryRoutes = new Map<
      ElkEdge,
      {
        source?: { owner: ElkNode; points: ElkPoint[]; junctionPoints?: ElkPoint[] };
        target?: { owner: ElkNode; points: ElkPoint[]; junctionPoints?: ElkPoint[] };
      }
    >();
    const syntheticPortIds = new Set<string>();
    const authoredPortsByCompound = new Map<ElkNode, ElkPort[] | undefined>();
    const authoredOptionsByCompound = new Map<ElkNode, Record<string, unknown> | undefined>();
    const originalHierarchyEndpoints = new Map(
      (graph.edges ?? []).map((edge) => [
        edge,
        {
          sourceId: String(edge.sources?.[0] ?? edge.source),
          targetId: String(edge.targets?.[0] ?? edge.target),
          sources: edge.sources,
          targets: edge.targets,
          source: edge.source,
          target: edge.target,
        },
      ]),
    );
    const hierarchyHandling = getOption(layoutOptions, "hierarchyHandling");
    const topdownLayout = getBooleanOption(layoutOptions, "topdownLayout") === true;
    const separateHierarchy =
      hasHierarchy && hierarchyHandling !== undefined && hierarchyHandling !== "INCLUDE_CHILDREN";
    if (hasHierarchy && topdownLayout && hierarchyHandling === "INCLUDE_CHILDREN") {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedConfigurationException: Topdown layout cannot be used together with hierarchy handling.",
      );
    }
    if (separateHierarchy) {
      const hasCrossHierarchyEdge = (container: ElkNode): boolean => {
        const directEndpointIds = new Set<string>();
        for (const child of container.children ?? []) {
          directEndpointIds.add(String(child.id));
          for (const port of child.ports ?? []) directEndpointIds.add(String(port.id));
        }
        if (
          (container.edges ?? []).some((edge) => {
            const sourceId = String(edge.sources?.[0] ?? edge.source);
            const targetId = String(edge.targets?.[0] ?? edge.target);
            return !directEndpointIds.has(sourceId) || !directEndpointIds.has(targetId);
          })
        ) {
          return true;
        }
        return (container.children ?? []).some((child) => hasCrossHierarchyEdge(child));
      };
      if (hasCrossHierarchyEdge(graph)) {
        throw new Error(
          "org.eclipse.elk.core.UnsupportedGraphException: Hierarchical edges require INCLUDE_CHILDREN",
        );
      }
      for (const child of graph.children ?? []) {
        if ((child.children?.length ?? 0) === 0) continue;
        await this.#layout(child, {
          ...arguments_,
          layoutOptions: {
            ...arguments_.layoutOptions,
            ...child.layoutOptions,
            hierarchyHandling,
          },
          logging: false,
          measureExecutionTime: false,
        });
      }
    }
    if (hasHierarchy && topdownLayout) {
      if (getOption(layoutOptions, "topdown.nodeType") === undefined) {
        throw new Error(`${String(graph.id)} has not been assigned a top-down node type.`);
      }
      for (const child of graph.children ?? []) {
        if ((child.children?.length ?? 0) === 0) continue;
        const childOptions = { ...layoutOptions, ...child.layoutOptions };
        const childPadding = parsePadding(getOption(childOptions, "padding"), 12);
        const parallelNode = getOption(childOptions, "topdown.nodeType") === "PARALLEL_NODE";
        const width =
          getNumberOption(childOptions, "topdown.hierarchicalNodeWidth") ??
          (parallelNode ? 150 : 0);
        const aspectRatio =
          getNumberOption(childOptions, "topdown.hierarchicalNodeAspectRatio") ??
          (parallelNode ? 1.414 : 1 / Math.sqrt(2));
        child.width = Math.max(child.width ?? 0, width + childPadding.left + childPadding.right);
        child.height = Math.max(
          child.height ?? 0,
          width / aspectRatio + childPadding.top + childPadding.bottom,
        );
      }
    } else if (hasHierarchy && !separateHierarchy) {
      // Prepare boundary identities before coordinating parent and child crossing sweeps.
      const scopeSegmentOrder =
        segmentOrderByScope.get(graph) ??
        elkSegmentOrder(graph, graph, originalHierarchyEndpoints, false);
      for (const child of graph.children ?? []) {
        if ((child.children?.length ?? 0) === 0) continue;
        const descendantOwnerByEndpointId = new Map<string, ElkNode>();
        const collectDescendants = (node: ElkNode): void => {
          for (const descendant of node.children ?? []) {
            descendantOwnerByEndpointId.set(String(descendant.id), descendant);
            for (const port of descendant.ports ?? []) {
              descendantOwnerByEndpointId.set(String(port.id), descendant);
            }
            collectDescendants(descendant);
          }
        };
        collectDescendants(child);
        const internalEdges = (graph.edges ?? []).filter((edge) => {
          const { sourceId, targetId } = originalHierarchyEndpoints.get(edge)!;
          return (
            descendantOwnerByEndpointId.has(sourceId) && descendantOwnerByEndpointId.has(targetId)
          );
        });
        for (const edge of child.edges ?? [])
          if (!originalHierarchyEndpoints.has(edge))
            originalHierarchyEndpoints.set(edge, {
              sourceId: String(edge.sources?.[0] ?? edge.source),
              targetId: String(edge.targets?.[0] ?? edge.target),
              sources: edge.sources,
              targets: edge.targets,
              source: edge.source,
              target: edge.target,
            });
        const crossingEdges = [...(graph.edges ?? []), ...(child.edges ?? [])].filter((edge) => {
          const { sourceId, targetId } = originalHierarchyEndpoints.get(edge)!;
          const sourceInside = descendantOwnerByEndpointId.has(sourceId);
          const targetInside = descendantOwnerByEndpointId.has(targetId);
          return sourceInside !== targetInside;
        });
        // CompoundGraphPreprocessor creates boundary ports bottom-up: ports
        // exported by nested groups first, then direct children's ports in
        // port order, outgoing edges before incoming edges.
        const boundaryRank = new Map(
          elkBoundaryEdgeOrder(child, graph, originalHierarchyEndpoints).map((edge, index) => [
            edge,
            index,
          ]),
        );
        crossingEdges.sort(
          (a, b) =>
            (boundaryRank.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (boundaryRank.get(b) ?? Number.MAX_SAFE_INTEGER),
        );
        const mergeHierarchyEdges =
          getBooleanOption(layoutOptions, "layered.mergeHierarchyEdges") !== false;
        // ELK merges only edges incident to the same descendant port.
        const proxyByKind = new Map<string, ElkNode>();
        const implicitOwnPorts = new Map<ElkEdge, ElkPort>();
        const ownPortFor = (edge: ElkEdge): ElkPort | undefined => {
          const e = originalHierarchyEndpoints.get(edge)!;
          const outside = descendantOwnerByEndpointId.has(e.sourceId) ? e.targetId : e.sourceId;
          if (e.sourceId === String(child.id) || e.targetId === String(child.id)) {
            let port = implicitOwnPorts.get(edge);
            if (!port) {
              const direction = getDirection(layoutOptions);
              const sourceInside = e.sourceId === String(child.id);
              const side = sourceInside
                ? ({ right: "EAST", left: "WEST", down: "SOUTH", up: "NORTH" } as const)[direction]
                : ({ right: "WEST", left: "EAST", down: "NORTH", up: "SOUTH" } as const)[direction];
              port = {
                id: `__native_hierarchy_own_${String(child.id)}_${implicitOwnPorts.size}`,
                width: 0,
                height: 0,
                layoutOptions: { "elk.port.side": side },
              };
              implicitOwnPorts.set(edge, port);
              syntheticPortIds.add(String(port.id));
            }
            return child.ports?.find((p) => p.id === port!.id) ?? port;
          }
          return child.ports?.find((p) => String(p.id) === outside);
        };

        const proxyKey = (kind: "input" | "output", edge: ElkEdge): string => {
          const own = ownPortFor(edge);
          if (own) return JSON.stringify(["authored", own.id]);
          const endpoints = originalHierarchyEndpoints.get(edge)!;
          const endpoint = kind === "output" ? endpoints.sourceId : endpoints.targetId;
          const owner = descendantOwnerByEndpointId.get(endpoint);
          const explicitPort = owner?.ports?.some((port) => String(port.id) === endpoint);
          return JSON.stringify([
            kind,
            mergeHierarchyEdges && explicitPort ? endpoint : String(edge.id),
          ]);
        };
        const createBoundaryProxy = (
          key: string,
          kind: "input" | "output",
          own: ElkPort | undefined,
          netFlow: number,
        ): ElkNode => {
          let proxy = proxyByKind.get(key);
          if (!proxy) {
            const direction = getDirection({ ...layoutOptions, ...child.layoutOptions });
            const authoredAnchor = own
              ? (getElementLayeredSettings(own.layoutOptions ?? {})["port.anchor"] as
                  | ElkPoint
                  | undefined)
              : undefined;
            const origin = createExternalPortDummy({
              constraints: (getOption(child.layoutOptions ?? {}, "portConstraints") ??
                "FREE") as ExternalPortConstraints,
              side: own
                ? ((getOption(own.layoutOptions ?? {}, "port.side") ??
                    (kind === "output" ? "EAST" : "WEST")) as ExternalPortSide)
                : kind === "output"
                  ? "EAST"
                  : "WEST",
              position: { x: own?.x ?? 0, y: own?.y ?? 0 },
              anchor: authoredAnchor,
              index: own ? getNumberOption(own.layoutOptions ?? {}, "port.index") : undefined,
              direction: direction.toUpperCase() as "RIGHT" | "LEFT" | "DOWN" | "UP",
              netFlow,
              borderOffset: own
                ? (getNumberOption(own.layoutOptions ?? {}, "port.borderOffset") ?? 0)
                : (getNumberOption(layoutOptions, "spacing.edgeEdge") ?? 10) / 2,
              size: { width: own?.width ?? 0, height: own?.height ?? 0 },
            });
            if (own) origin.parentPortId = String(own.id);
            const id = `__native_hierarchy_${String(child.id)}_${proxyByKind.size}`;
            proxy = attachExternalPortDummy(
              {
                id,
                width: origin.width,
                height: origin.height,
                layoutOptions: {
                  "elk.portConstraints": origin.constraints,
                  "elk.layered.layering.layerConstraint":
                    origin.side ===
                    ({ right: "EAST", left: "WEST", down: "SOUTH", up: "NORTH" } as const)[
                      direction
                    ]
                      ? "LAST_SEPARATE"
                      : origin.side ===
                          ({ right: "WEST", left: "EAST", down: "NORTH", up: "SOUTH" } as const)[
                            direction
                          ]
                        ? "FIRST_SEPARATE"
                        : undefined,
                },
                ports: [
                  {
                    id: `${id}:boundary`,
                    x: origin.port.x,
                    y: origin.port.y,
                    width: 0,
                    height: 0,
                    layoutOptions: { "elk.port.side": origin.port.side },
                  },
                ],
              },
              origin,
            );
            proxyByKind.set(key, proxy);
          }
          return proxy;
        };
        const ownedPortNetFlow = (id: string): number => {
          let votes = 0;
          for (const edge of originalHierarchyEndpoints.values()) {
            if (edge.sourceId === id)
              votes += descendantOwnerByEndpointId.has(edge.targetId) ? -1 : 1;
            if (edge.targetId === id)
              votes += descendantOwnerByEndpointId.has(edge.sourceId) ? 1 : -1;
          }
          return votes;
        };
        const proxyFor = (kind: "input" | "output", edge: ElkEdge): ElkNode => {
          const own = ownPortFor(edge);
          const flow = implicitOwnPorts.has(edge)
            ? kind === "output"
              ? 1
              : -1
            : own
              ? ownedPortNetFlow(String(own.id))
              : kind === "output"
                ? 1
                : -1;
          return createBoundaryProxy(proxyKey(kind, edge), kind, own, flow);
        };
        // ELK imports ancestor edges before descendant-local edges. Preserve
        // that implicit port creation order through child phase preparation.
        const temporaryEdges: ElkEdge[] = [
          ...crossingEdges.map((edge) => {
            const { sourceId, targetId } = originalHierarchyEndpoints.get(edge)!;
            const sourceInside = descendantOwnerByEndpointId.has(sourceId);
            const proxy = proxyFor(sourceInside ? "output" : "input", edge);
            const segment: ElkEdge = {
              ...edge,
              id: `__native_hierarchy_edge_${String(child.id)}_${String(edge.id)}`,
              sources: [sourceInside ? sourceId : proxy.ports![0]!.id!],
              targets: [sourceInside ? proxy.ports![0]!.id! : targetId],
              source: undefined,
              target: undefined,
              sections: undefined,
            };
            originalEdgeId.set(segment, originalEdgeId.get(edge) ?? String(edge.id));
            return segment;
          }),
          ...(child.edges ?? []).filter((edge) => !crossingEdges.includes(edge)),
          ...internalEdges.filter(
            (edge) =>
              !(child.edges ?? []).some((candidate) => String(candidate.id) === String(edge.id)),
          ),
        ];
        const hasExternalPorts = proxyByKind.size > 0;
        const inactiveAuthoredPorts: Array<{ port: ElkPort; proxy: ElkNode }> = [];
        if (hasExternalPorts) {
          for (const port of child.ports ?? []) {
            const key = JSON.stringify(["authored", port.id]);
            if (proxyByKind.has(key)) continue;
            const flow = ownedPortNetFlow(String(port.id));
            inactiveAuthoredPorts.push({
              port,
              proxy: createBoundaryProxy(key, flow >= 0 ? "output" : "input", port, flow),
            });
          }
        }
        const outsideNodeEdges = !hasExternalPorts
          ? []
          : (graph.edges ?? []).filter((edge) => {
              const e = originalHierarchyEndpoints.get(edge)!;
              return (
                (e.sourceId === String(child.id) || e.targetId === String(child.id)) &&
                !descendantOwnerByEndpointId.has(e.sourceId) &&
                !descendantOwnerByEndpointId.has(e.targetId)
              );
            });
        for (const edge of outsideNodeEdges) {
          const e = originalHierarchyEndpoints.get(edge)!;
          proxyFor(e.sourceId === String(child.id) ? "output" : "input", edge);
        }
        const temporaryChild: ElkNode = {
          ...child,
          layoutOptions: proxyByKind.size
            ? { ...child.layoutOptions, "elk.portConstraints": "FIXED_SIDE" }
            : child.layoutOptions,
          children: [...(child.children ?? []), ...proxyByKind.values()],
          edges: temporaryEdges,
        };
        const childSegmentOrder = elkSegmentOrder(child, graph, originalHierarchyEndpoints, true);
        segmentOrderByScope.set(temporaryChild, childSegmentOrder);
        // Boundary segments copied into the child scope keep their original identity.
        for (const edge of temporaryEdges) {
          const id = originalEdgeId.get(edge);
          const rank = id === undefined ? undefined : childSegmentOrder.get(id);
          if (rank !== undefined) hierarchySegmentRank.set(edge, rank);
        }
        const preparedChild = await this.#prepareLayout(
          temporaryChild,
          {
            ...arguments_,
            layoutOptions: {
              ...arguments_.layoutOptions,
              // The compound's own direction wins over the inherited one.
              direction: getDirection(
                getOption(child.layoutOptions ?? {}, "direction") === undefined
                  ? layoutOptions
                  : child.layoutOptions!,
              ).toUpperCase(),
              hierarchyHandling: "INCLUDE_CHILDREN",
            },
            logging: false,
            measureExecutionTime: false,
          },
          true,
        );
        preparedChildren.set(String(child.id), preparedChild);
        authoredPortsByCompound.set(child, child.ports);
        authoredOptionsByCompound.set(child, child.layoutOptions);
        const initialPorts = (child.ports ?? []).map((port) => ({
          ...port,
          layoutOptions: port.layoutOptions ? { ...port.layoutOptions } : undefined,
        }));
        for (const edge of crossingEdges) {
          const own = ownPortFor(edge);
          if (own) {
            const original = originalHierarchyEndpoints.get(edge)!;
            const sourceInside = descendantOwnerByEndpointId.has(original.sourceId);
            const origin = externalPortDummyOf(
              proxyByKind.get(proxyKey(sourceInside ? "output" : "input", edge))!,
            )!;
            let port = initialPorts.find((p) => p.id === own.id);
            if (!port) {
              port = { ...own, layoutOptions: { ...own.layoutOptions } };
              initialPorts.push(port);
            }
            port.layoutOptions = { ...port.layoutOptions, "elk.port.side": origin.side };
            continue;
          }
          const original = originalHierarchyEndpoints.get(edge)!;
          const sourceInside = descendantOwnerByEndpointId.has(original.sourceId);
          const proxy = proxyByKind.get(proxyKey(sourceInside ? "output" : "input", edge))!;
          const origin = externalPortDummyOf(proxy)!;
          const portId = `${String(proxy.id)}:parent`;
          syntheticPortIds.add(portId);
          if (!initialPorts.some((port) => port.id === portId))
            initialPorts.push({
              id: portId,
              width: origin.externalSize.width,
              height: origin.externalSize.height,
              x: 0,
              y: 0,
              layoutOptions: {
                "elk.port.side": origin.side,
                "elk.port.borderOffset": origin.borderOffset,
              },
            });
          if (!hierarchyRestorations.some((restoration) => restoration.edge === edge))
            hierarchyRestorations.push({ edge, ...original });
          if (sourceInside) edge.sources = [portId];
          else edge.targets = [portId];
          const rank = scopeSegmentOrder.get(originalEdgeId.get(edge) ?? String(edge.id));
          if (rank !== undefined) hierarchySegmentRank.set(edge, rank);
          edge.source = undefined;
          edge.target = undefined;
        }
        for (const { port, proxy } of inactiveAuthoredPorts) {
          const actual = initialPorts.find((p) => p.id === port.id)!;
          actual.layoutOptions = {
            ...actual.layoutOptions,
            "elk.port.side": externalPortDummyOf(proxy)!.side,
          };
        }
        for (const edge of outsideNodeEdges) {
          const original = originalHierarchyEndpoints.get(edge)!;
          const source = original.sourceId === String(child.id);
          const proxy = proxyFor(source ? "output" : "input", edge),
            own = ownPortFor(edge)!;
          const origin = externalPortDummyOf(proxy)!;
          if (!initialPorts.some((p) => p.id === own.id))
            initialPorts.push({
              ...own,
              layoutOptions: { ...own.layoutOptions, "elk.port.side": origin.side },
            });
          if (!hierarchyRestorations.some((r) => r.edge === edge))
            hierarchyRestorations.push({ edge, ...original });
          if (source) edge.sources = [own.id!];
          else edge.targets = [own.id!];
          edge.source = undefined;
          edge.target = undefined;
        }
        child.ports = initialPorts;
        child.layoutOptions = {
          ...child.layoutOptions,
          "elk.portConstraints":
            // ELK fixes physical boundary sides after introducing hierarchy dummies.
            // Authored constraints are restored when finishing the public graph.
            crossingEdges.length > 0 || outsideNodeEdges.length > 0
              ? "FIXED_SIDE"
              : (getOption(authoredOptionsByCompound.get(child) ?? {}, "portConstraints") ??
                "FREE"),
        };
        finishChildren.push(async () => {
          await preparedChild.finish(activeOrders);
          const childPadding = parsePadding(
            getOption({ ...layoutOptions, ...child.layoutOptions }, "padding"),
            12,
          );
          for (const internalEdge of internalEdges) {
            const temporary = temporaryEdges.find(
              (candidate) => String(candidate.id) === String(internalEdge.id),
            );
            if (temporary?.sections) {
              internalEdge.sections = temporary.sections;
              // A nested scope may own the route (an edge from a compound's
              // own port to its child); keep that coordinate frame.
              internalEdge.container = (temporary as { container?: string }).container ?? child.id;
            }
          }
          const childDirection = getDirection({ ...layoutOptions, ...child.layoutOptions });
          const horizontalChild = childDirection === "right" || childDirection === "left";
          // External dummy positions retain any routing corridor at the boundary.
          const restoredPerpendicular = [...proxyByKind.values()].some(isPerpendicularPortRestored);
          child.width = restoredPerpendicular
            ? temporaryChild.width
            : horizontalChild
              ? Math.max(
                  0,
                  ...(temporaryChild.children ?? []).map(
                    (node) => (node.x ?? 0) + (node.width ?? 0),
                  ),
                ) + childPadding.right
              : temporaryChild.width;
          child.height = restoredPerpendicular
            ? temporaryChild.height
            : horizontalChild
              ? temporaryChild.height
              : Math.max(
                  0,
                  ...(temporaryChild.children ?? []).map(
                    (node) => (node.y ?? 0) + (node.height ?? 0),
                  ),
                ) + childPadding.bottom;

          const relativeRect = (id: string): ElkShape | undefined => {
            const owner = descendantOwnerByEndpointId.get(id);
            if (!owner) return undefined;
            const path: ElkNode[] = [];
            const visit = (parent: ElkNode): boolean => {
              for (const candidate of parent.children ?? []) {
                path.push(candidate);
                if (candidate === owner || visit(candidate)) return true;
                path.pop();
              }
              return false;
            };
            if (!visit(child)) return undefined;
            const port = owner.ports?.find((candidate) => String(candidate.id) === id);
            const ownerX = path.reduce((sum, node) => sum + (node.x ?? 0), 0);
            const ownerY = path.reduce((sum, node) => sum + (node.y ?? 0), 0);
            if (port) {
              return {
                x: ownerX + (port.x ?? 0) + (port.width ?? 0) / 2,
                y: ownerY + (port.y ?? 0) + (port.height ?? 0) / 2,
                width: 0,
                height: 0,
              };
            }
            return {
              x: ownerX,
              y: ownerY,
              width: path.at(-1)?.width ?? 0,
              height: path.at(-1)?.height ?? 0,
            };
          };
          const ports = (authoredPortsByCompound.get(child) ?? []).map(
            (original) => child.ports?.find((port) => port.id === original.id) ?? original,
          );
          for (const edge of crossingEdges) {
            const original = originalHierarchyEndpoints.get(edge)!;
            const { sourceId, targetId } = original;
            const sourceInside = descendantOwnerByEndpointId.has(sourceId);
            const descendantId = sourceInside ? sourceId : targetId;
            const rect = relativeRect(descendantId);
            if (!rect) continue;
            const internalEdge = temporaryEdges.find(
              (candidate) =>
                String(candidate.id) ===
                `__native_hierarchy_edge_${String(child.id)}_${String(edge.id)}`,
            );
            const internalRoute = internalEdge?.sections;
            const kind = sourceInside ? "output" : "input";
            const proxy = proxyByKind.get(proxyKey(kind, edge))!;
            const origin = externalPortDummyOf(proxy)!;
            const endpoint = sourceInside
              ? internalRoute?.at(-1)?.endPoint
              : internalRoute?.[0]?.startPoint;
            if (!endpoint)
              throw new Error(`Missing compound boundary route for ${String(edge.id)}`);
            const transferred = transferExternalPort({
              contentSize: {
                width: child.width! - childPadding.left - childPadding.right,
                height: child.height! - childPadding.top - childPadding.bottom,
              },
              padding: childPadding,
              offset: { x: 0, y: 0 },
              dummy: {
                x: endpoint.x - childPadding.left - (ownPortFor(edge) ? origin.port.x : 0),
                y: endpoint.y - childPadding.top - (ownPortFor(edge) ? origin.port.y : 0),
                width: origin.width,
                height: origin.height,
              },
              side: origin.side,
              borderOffset: origin.borderOffset,
              portSize: origin.externalSize,
            });
            const points = internalRoute!
              .flatMap((section, index) => [
                ...(index === 0 ? [section.startPoint] : []),
                ...(section.bendPoints ?? []),
                section.endPoint,
              ])
              .map((point) => ({ ...point }));
            const boundary = sourceInside ? points.at(-1)! : points[0]!;
            boundary.x = transferred.dummy.x + childPadding.left;
            boundary.y = transferred.dummy.y + childPadding.top;
            const own = ownPortFor(edge);
            if (own) {
              if (implicitOwnPorts.has(edge) && !ports.some((p) => p.id === own.id))
                ports.push(own);
              own.x = transferred.port.x;
              own.y = transferred.port.y;
              const anchor = (getElementLayeredSettings(own.layoutOptions ?? {})["port.anchor"] as
                | ElkPoint
                | undefined) ?? {
                x:
                  origin.side === "EAST"
                    ? (own.width ?? 0)
                    : origin.side === "WEST"
                      ? 0
                      : (own.width ?? 0) / 2,
                y:
                  origin.side === "SOUTH"
                    ? (own.height ?? 0)
                    : origin.side === "NORTH"
                      ? 0
                      : (own.height ?? 0) / 2,
              };
              boundary.x = own.x + anchor.x;
              boundary.y = own.y + anchor.y;
              edge.sections = [
                {
                  id: `${String(edge.id)}_s0`,
                  startPoint: points[0]!,
                  endPoint: points.at(-1)!,
                  ...(points.length > 2 ? { bendPoints: points.slice(1, -1) } : {}),
                  incomingShape: sourceId,
                  outgoingShape: targetId,
                },
              ];
              if (internalEdge?.junctionPoints?.length)
                edge.junctionPoints = internalEdge.junctionPoints.map((point) => ({ ...point }));
              else delete edge.junctionPoints;
              edge.container = child.id;
              continue;
            }
            const routes = boundaryRoutes.get(edge) ?? {};
            routes[sourceInside ? "source" : "target"] = {
              owner: child,
              points,
              junctionPoints: internalEdge?.junctionPoints,
            };
            boundaryRoutes.set(edge, routes);
            const portId = `${String(proxy.id)}:parent`;
            syntheticPortIds.add(portId);
            if (!ports.some((port) => port.id === portId))
              ports.push({
                id: portId,
                width: origin.externalSize.width,
                height: origin.externalSize.height,
                x: transferred.port.x,
                y: transferred.port.y,
                layoutOptions: {
                  "elk.port.side": origin.side,
                  "elk.port.borderOffset": origin.borderOffset,
                },
              });
            if (!hierarchyRestorations.some((restoration) => restoration.edge === edge)) {
              hierarchyRestorations.push({ edge, ...original });
            }
            if (sourceInside) edge.sources = [portId];
            else edge.targets = [portId];
            edge.source = undefined;
            edge.target = undefined;
          }
          for (const { port, proxy } of inactiveAuthoredPorts) {
            const origin = externalPortDummyOf(proxy)!;
            const actual = ports.find((p) => p.id === port.id)!;
            const transferred = transferExternalPort({
              contentSize: {
                width: child.width! - childPadding.left - childPadding.right,
                height: child.height! - childPadding.top - childPadding.bottom,
              },
              padding: childPadding,
              offset: { x: 0, y: 0 },
              dummy: {
                x: (proxy.x ?? 0) - childPadding.left,
                y: (proxy.y ?? 0) - childPadding.top,
                width: origin.width,
                height: origin.height,
              },
              side: origin.side,
              borderOffset: origin.borderOffset,
              portSize: origin.externalSize,
            });
            actual.x = transferred.port.x;
            actual.y = transferred.port.y;
          }
          for (const edge of outsideNodeEdges) {
            const original = originalHierarchyEndpoints.get(edge)!;
            const proxy = proxyFor(
                original.sourceId === String(child.id) ? "output" : "input",
                edge,
              ),
              origin = externalPortDummyOf(proxy)!,
              own = ownPortFor(edge)!;
            const transferred = transferExternalPort({
              contentSize: {
                width: child.width! - childPadding.left - childPadding.right,
                height: child.height! - childPadding.top - childPadding.bottom,
              },
              padding: childPadding,
              offset: { x: 0, y: 0 },
              dummy: {
                x: (proxy.x ?? 0) - childPadding.left,
                y: (proxy.y ?? 0) - childPadding.top,
                width: origin.width,
                height: origin.height,
              },
              side: origin.side,
              borderOffset: origin.borderOffset,
              portSize: origin.externalSize,
            });
            own.x = transferred.port.x;
            own.y = transferred.port.y;
            if (!ports.some((p) => p.id === own.id)) ports.push(own);
          }
          child.ports = ports;
          child.layoutOptions = { ...child.layoutOptions, "elk.portConstraints": "FIXED_POS" };
          const insideLoopCount = (graph.edges ?? []).filter((edge) =>
            isInsideSelfLoop(graph, edge, String(child.id)),
          ).length;
          if (insideLoopCount > 0) {
            const baseHeight = child.height ?? 0;
            insideSelfLoopBaseHeightByNodeId.set(String(child.id), baseHeight);
            child.height = baseHeight + insideLoopCount * 11;
          }
        });
      }
    }
    applyNodeMicroLayout(graph, layoutOptions);
    const graph_ = toGraph(graph, layoutOptions);
    const layerConstraintByNodeId = new Map(
      (graph.children ?? []).map((node) => [
        String(node.id),
        String(
          getOption(node.layoutOptions ?? {}, "layered.layering.layerConstraint") ??
            getOption(node.layoutOptions ?? {}, "layerConstraint") ??
            "NONE",
        ),
      ]),
    );
    if (
      algorithm === "layered" &&
      graph_.edges.some((edge) => {
        if (edge.sourceId === edge.targetId) return false;
        const sourceConstraint = layerConstraintByNodeId.get(edge.sourceId);
        const targetConstraint = layerConstraintByNodeId.get(edge.targetId);
        return (
          (sourceConstraint === "FIRST" || sourceConstraint === "FIRST_SEPARATE") &&
          (targetConstraint === "FIRST" || targetConstraint === "FIRST_SEPARATE")
        );
      })
    ) {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedConfigurationException: Layer constraints conflict",
      );
    }
    const padding = parsePadding(
      getOption(layoutOptions, "padding"),
      algorithm === "layered" ? 12 : 0,
    );
    const options: LayeredLayoutOptions = {
      direction: getDirection(layoutOptions),
      spacing: {
        node:
          getNumberOption(layoutOptions, "spacing.nodeNode") ??
          getNumberOption(layoutOptions, "layered.spacing.baseValue"),
        layer:
          getNumberOption(layoutOptions, "layered.spacing.nodeNodeBetweenLayers") ??
          getNumberOption(layoutOptions, "layered.spacing.baseValue") ??
          20,
      },
      padding,
      constraints: {
        layer: () => undefined,
      },
      settings: {
        ...getLayeredSettings(layoutOptions),
        ...(compoundLayout || (hasHierarchy && !separateHierarchy && !topdownLayout)
          ? { separateConnectedComponents: false }
          : {}),
        ...(hierarchyHandling === "INCLUDE_CHILDREN"
          ? {
              "crossingMinimization.greedySwitch.type": String(
                getOption(
                  layoutOptions,
                  "layered.crossingMinimization.greedySwitchHierarchical.type",
                ) ?? "TWO_SIDED",
              ) as LayeredAdvancedOptions["crossingMinimization.greedySwitch.type"],
            }
          : {}),
      },
      nodeSettings: (node) => {
        const child = findById(graph.children, node.id)?.item;
        return getElementLayeredSettings(child?.layoutOptions ?? {});
      },
      edgeSettings: (edge) => {
        const elkEdge = findById(graph.edges, edge.id)?.item;
        return {
          ...getElementLayeredSettings(elkEdge?.layoutOptions ?? {}),
          ...getElementLayeredSettings(elkEdge?.labels?.[0]?.layoutOptions ?? {}),
          // ELK appends hierarchy segments to port edge lists in creation order.
          "edge.hierarchyRank": elkEdge && hierarchySegmentRank.get(elkEdge),
        };
      },
      portSettings: (port, node) => {
        const child = findById(graph.children, node.id)?.item;
        const found = findById(child?.ports, port.name);
        const elkPort = found?.item;
        return {
          ...getElementLayeredSettings(elkPort?.layoutOptions ?? {}),
          // ELK imports ports in authored order and sorts sides after dummy insertion.
          "port.authoredIndex": found?.position,
          "port.labelWidth": Math.max(
            0,
            ...(elkPort?.labels ?? []).map((label) => label.width ?? 0),
          ),
          "port.labelHeight": Math.max(
            0,
            ...(elkPort?.labels ?? []).map((label) => label.height ?? 0),
          ),
        } as ElkLayeredOptionValueByName;
      },
    };
    const pipeline =
      algorithm === "layered" ? createLayeredScopePipeline(graph_, options) : undefined;
    const initial = pipeline?.next();
    const phase = initial && !initial.done ? initial.value : undefined;
    let activeOrders: ReadonlyMap<PreparedElkScope, LayerOrder> | undefined;
    let finished: Promise<ElkNode> | undefined;
    const prepared: PreparedElkScope = {
      graph,
      native: graph_,
      phase,
      options,
      children: preparedChildren,
      finish: (orders) => {
        if (finished) return finished;
        activeOrders = orders;
        finished = finish();
        return finished;
      },
    };
    const finishLayered = (): VisualGraph => {
      if (!pipeline || !initial) throw new Error("Missing layered pipeline");
      if (initial.done) return initial.value;
      const completed = pipeline.next(
        activeOrders?.has(prepared)
          ? initial.value.finishOrder(activeOrders.get(prepared)!)
          : initial.value.minimize(),
      );
      if (!completed.done) throw new Error("Layered scope yielded more than one crossing phase");
      return completed.value;
    };
    const finish = async (): Promise<ElkNode> => {
      for (const complete of finishChildren) await complete();
      for (const nativeGraph of new Set(
        [graph_, phase?.input.graph].filter((value) => value !== undefined),
      )) {
        for (const child of graph.children ?? []) {
          const native = nativeGraph.nodes.find((node) => node.id === String(child.id));
          if (!native || !preparedChildren.has(String(child.id))) continue;
          phase?.updateNodeSize(native.id, { width: child.width ?? 0, height: child.height ?? 0 });
          Object.assign(native, { width: child.width, height: child.height });
          for (const port of native.ports ?? []) {
            const actual = child.ports?.find((candidate) => String(candidate.id) === port.name);
            if (actual)
              Object.assign(port, {
                x: actual.x,
                y: actual.y,
                width: actual.width,
                height: actual.height,
              });
          }
        }
      }
      const laidOut = await (algorithm === "sporeCompaction"
        ? executeElkjs0111Layout({
            algorithm: "sporeCompaction",
            graph: graph_,
            options: {
              padding,
              spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
            },
          })
        : algorithm === "sporeOverlap"
          ? executeElkjs0111Layout({
              algorithm: "sporeOverlap",
              graph: graph_,
              options: {
                padding,
                spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
              },
            })
          : algorithm === "rectpacking"
            ? executeElkjs0111Layout({
                algorithm: "rectpacking",
                graph: graph_,
                options: {
                  padding: getOption(layoutOptions, "padding") === undefined ? 15 : padding,
                  spacing: getNumberOption(layoutOptions, "spacing.nodeNode") ?? 15,
                },
              })
            : algorithm === "random"
              ? executeElkjs0111Layout({
                  algorithm: "random",
                  graph: graph_,
                  options: {
                    padding: getOption(layoutOptions, "padding") === undefined ? 15 : padding,
                    spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
                    aspectRatio: getNumberOption(layoutOptions, "aspectRatio"),
                    seed: getNumberOption(layoutOptions, "randomSeed"),
                  },
                })
              : algorithm === "box"
                ? executeElkjs0111Layout({
                    algorithm: "box",
                    graph: graph_,
                    options: {
                      padding: getOption(layoutOptions, "padding") === undefined ? 15 : padding,
                      spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
                      aspectRatio: getNumberOption(layoutOptions, "aspectRatio"),
                      interactive: getBooleanOption(layoutOptions, "interactive"),
                      expandNodes: getBooleanOption(layoutOptions, "expandNodes"),
                      priority: (node) => {
                        const child = graph.children?.find(
                          (candidate) => String(candidate.id) === node.id,
                        );
                        return getNumberOption(child?.layoutOptions ?? {}, "priority");
                      },
                    },
                  })
                : algorithm === "fixed"
                  ? executeElkjs0111Layout({
                      algorithm: "fixed",
                      graph: graph_,
                      options: { direction: getDirection(layoutOptions) },
                    })
                  : finishLayered());
      const resultPolicy = (
        laidOut as typeof laidOut & {
          [elkjs0111ResultPolicy]?: Elkjs0111ResultPolicy;
        }
      )[elkjs0111ResultPolicy];
      applyLayout(graph, laidOut, padding, layoutOptions, resultPolicy);
      if (resultPolicy?.providerBounds) {
        graph.width = resultPolicy.providerBounds.width;
        graph.height = resultPolicy.providerBounds.height;
      }
      for (const restoration of hierarchyRestorations) {
        const splits = boundaryRoutes.get(restoration.edge);
        const sections = restoration.edge.sections;
        if (splits && sections?.length) {
          const parentPoints = sections.flatMap((section, index) => [
            ...(index === 0 ? [section.startPoint] : []),
            ...(section.bendPoints ?? []),
            section.endPoint,
          ]);
          const segments = [
            ...(splits.source
              ? [
                  {
                    points: splits.source.points,
                    offset: { x: splits.source.owner.x ?? 0, y: splits.source.owner.y ?? 0 },
                  },
                ]
              : []),
            { points: parentPoints, offset: { x: 0, y: 0 } },
            ...(splits.target
              ? [
                  {
                    points: splits.target.points,
                    offset: { x: splits.target.owner.x ?? 0, y: splits.target.owner.y ?? 0 },
                  },
                ]
              : []),
          ];
          const points = joinCompoundRouteSegments(
            segments,
            getBooleanOption(layoutOptions, "unnecessaryBendpoints") === true,
          );
          const childJunctions = (split: typeof splits.source) =>
            (split?.junctionPoints ?? []).map((point) => ({
              x: point.x + (split?.owner.x ?? 0),
              y: point.y + (split?.owner.y ?? 0),
            }));
          const junctions = [
            ...childJunctions(splits.source),
            ...(restoration.edge.junctionPoints ?? []),
            ...childJunctions(splits.target),
          ];
          if (junctions.length) restoration.edge.junctionPoints = junctions;
          else delete restoration.edge.junctionPoints;
          restoration.edge.sections = [
            {
              ...sections[0]!,
              startPoint: points[0]!,
              endPoint: points.at(-1)!,
              bendPoints: points.slice(1, -1),
            },
          ];
        }
        restoration.edge.sources = restoration.sources;
        restoration.edge.targets = restoration.targets;
        restoration.edge.source = restoration.source;
        restoration.edge.target = restoration.target;
        for (const section of restoration.edge.sections ?? []) {
          if (
            section.incomingShape != null &&
            syntheticPortIds.has(String(section.incomingShape))
          ) {
            section.incomingShape = restoration.sources?.[0] ?? restoration.source;
          }
          if (
            section.outgoingShape != null &&
            syntheticPortIds.has(String(section.outgoingShape))
          ) {
            section.outgoingShape = restoration.targets?.[0] ?? restoration.target;
          }
        }
      }
      for (const [compound, ports] of authoredPortsByCompound) {
        for (const port of ports ?? []) {
          const actual = compound.ports?.find((p) => p.id === port.id);
          if (actual)
            Object.assign(port, {
              x: actual.x,
              y: actual.y,
              width: actual.width,
              height: actual.height,
            });
        }
        compound.ports = ports;
      }
      for (const [compound, options_] of authoredOptionsByCompound)
        compound.layoutOptions = options_;
      if (hasHierarchy && topdownLayout) {
        for (const child of graph.children ?? []) {
          if ((child.children?.length ?? 0) === 0) continue;
          const position = { x: child.x, y: child.y };
          await this.#layout(child, {
            ...arguments_,
            logging: false,
            measureExecutionTime: false,
          });
          child.x = position.x;
          child.y = position.y;
        }
      }
      applyInsideSelfLoops(graph, insideSelfLoopBaseHeightByNodeId);
      if (arguments_.logging || arguments_.measureExecutionTime) {
        graph.logging = {
          name: "Native TypeScript layout",
          children: [{ name: String(algorithm) }],
          ...(arguments_.measureExecutionTime
            ? { executionTime: (performance.now() - startedAt) / 1_000 }
            : {}),
        };
      }
      return graph;
    };
    return prepared;
  }
}

function coordinatePreparedScopes(
  root: PreparedElkScope,
): ReadonlyMap<PreparedElkScope, LayerOrder> | undefined {
  if (!root.phase || root.children.size === 0) return undefined;
  const prepared = [root];
  for (let i = 0; i < prepared.length; i++) prepared.push(...prepared[i]!.children.values());
  if (
    prepared.some(
      (scope) =>
        !scope.phase ||
        !["LAYER_SWEEP", "MEDIAN_LAYER_SWEEP"].includes(
          scope.options?.settings?.["crossingMinimization.strategy"] ?? "LAYER_SWEEP",
        ),
    )
  )
    return undefined;
  const scopes = new Map<PreparedElkScope, HierarchyCrossingScope>();
  for (const scope of prepared) {
    const phase = scope.phase!;
    scopes.set(scope, {
      session: createLayerSweepSession(
        phase.input,
        phase.orientation,
        phase.assignment,
        scope.options?.settings?.["crossingMinimization.strategy"] === "MEDIAN_LAYER_SWEEP"
          ? "median"
          : "mean",
        7,
        { resetSeed: scope === root },
      ),
      childrenByNodeId: new Map(),
      useBottomUp: true,
      independentRandom: scope !== root,
    });
  }
  for (const parent of prepared) {
    const parentScope = scopes.get(parent)!;
    for (const [id, child] of parent.children) {
      const nativeParent = parent.phase!.input.graph.nodes.find((node) => node.id === id)!;
      const parentPortOrderFixed = ["FIXED_ORDER", "FIXED_POS", "FIXED_RATIO"].includes(
        parent.phase!.input.nodeSettings?.(nativeParent)?.portConstraints ?? "FREE",
      );
      const ports = nativeParent.ports ?? [];
      const childPhase = child.phase!;
      const childSession = scopes.get(child)!.session;
      const childNodeById = new Map<string, (typeof childPhase.input.graph.nodes)[number]>();
      for (const node of childPhase.input.graph.nodes)
        if (!childNodeById.has(node.id)) childNodeById.set(node.id, node);
      const parentEdgeById = new Map<string, (typeof childPhase.input.graph.edges)[number]>();
      for (const edge of parent.phase!.input.graph.edges)
        if (!parentEdgeById.has(edge.id)) parentEdgeById.set(edge.id, edge);
      const flowSides = hierarchicalPortSides(parent.phase!.input);
      const inputPorts = ports.filter(
        (port) =>
          parent.phase!.input.portSettings?.(port, nativeParent)?.["port.side"] ===
          flowSides.before,
      ).length;
      const outputPorts = ports.filter(
        (port) =>
          parent.phase!.input.portSettings?.(port, nativeParent)?.["port.side"] === flowSides.after,
      ).length;
      const childScope: HierarchyCrossingScope = {
        ...scopes.get(child)!,
        useBottomUp: useBottomUpHierarchySweep(
          childPhase.input,
          childPhase.orientation,
          childSession.snapshot().layers,
          {
            portOrderFixed: parentPortOrderFixed,
            inputPorts,
            outputPorts,
            deterministic:
              child.options?.settings?.["crossingMinimization.strategy"] === "MEDIAN_LAYER_SWEEP",
          },
        ),
        alignBoundary: (forward) => {
          const childOrder = childSession.snapshot();
          const layerIndex = forward ? 0 : childOrder.layers.length - 1;
          const layer = childOrder.layers[layerIndex]!;
          if (!layer.every((id) => externalPortDummyOf(childNodeById.get(id)!))) return false;
          const parentOrder = parentScope.session.snapshot();
          // Parent port positions are physical; feedback reversal changes
          // edge direction without changing the boundary port's identity.
          const physical = parentOrder.physicalPortOrderByNodeId?.get(id) ?? [];
          const dummyByParentPort = new Map(
            childPhase.input.graph.nodes
              .filter((n) => externalPortDummyOf(n))
              .map((n) => [externalPortDummyOf(n)!.parentPortId ?? `${n.id}:parent`, n.id]),
          );
          const ordered = physical.flatMap((portId) => {
            const [nodeId, portName] = JSON.parse(portId) as [string, string];
            const dummy = nodeId === id ? dummyByParentPort.get(portName) : undefined;
            return dummy && layer.includes(dummy) ? [dummy] : [];
          });
          if (forward) ordered.reverse();
          const unique = [...new Set(ordered)];
          if (unique.length !== layer.length)
            throw new Error(`Incomplete hierarchical port order for ${id}`);
          const layers = childOrder.layers.map((layer, i) =>
            i === layerIndex ? unique : [...layer],
          );
          childSession.restore({ ...childOrder, layers });
          return true;
        },
        publishBoundary: (forward) => {
          const childOrder = childSession.snapshot();
          const layer = childOrder.layers[forward ? childOrder.layers.length - 1 : 0]!;
          if (!layer.every((id) => externalPortDummyOf(childNodeById.get(id)!))) return;
          const rank = new Map(
            layer.map((dummy, index) => [
              externalPortDummyOf(childNodeById.get(dummy)!)!.parentPortId ?? `${dummy}:parent`,
              index,
            ]),
          );
          const parentOrder = parentScope.session.snapshot();
          const physical = parentOrder.physicalPortOrderByNodeId?.get(id) ?? [];
          const boundarySlots = physical.flatMap((portId, index) => {
            const [nodeId, portName] = JSON.parse(portId) as [string, string];
            return nodeId === id && rank.has(portName) ? [index] : [];
          });
          const boundaryPorts = boundarySlots
            .map((index) => physical[index]!)
            .sort((a, b) => {
              const portA = (JSON.parse(a) as [string, string])[1];
              const portB = (JSON.parse(b) as [string, string])[1];
              const result = rank.get(portA)! - rank.get(portB)!;
              return forward ? result : -result;
            });
          const updatedPhysical = [...physical];
          boundarySlots.forEach((slot, index) => {
            updatedPhysical[slot] = boundaryPorts[index]!;
          });
          const physicalOrders = new Map(parentOrder.physicalPortOrderByNodeId);
          physicalOrders.set(id, updatedPhysical);
          const edgePortRank = (edgeId: string): number => {
            const edge = parentEdgeById.get(edgeId)!;
            const portName = edge.sourceId === id ? edge.sourcePort : edge.targetPort;
            return updatedPhysical.indexOf(JSON.stringify([id, portName]));
          };
          const incoming = new Map(parentOrder.inputPortOrderByNodeId);
          const outgoing = new Map(parentOrder.outputPortOrderByNodeId);
          for (const orders of [incoming, outgoing]) {
            const current = orders.get(id) ?? [];
            orders.set(
              id,
              [...current].sort((a, b) => edgePortRank(a) - edgePortRank(b)),
            );
          }
          parentScope.session.restore({
            ...parentOrder,
            physicalPortOrderByNodeId: physicalOrders,
            inputPortOrderByNodeId: incoming,
            outputPortOrderByNodeId: outgoing,
          });
        },
      };
      childScope.publishBottomUp = () => {
        childScope.publishBoundary!(true);
        childScope.publishBoundary!(false);
        parentScope.session.lockPortOrder(id);
      };
      scopes.set(child, childScope);
      (parentScope.childrenByNodeId as Map<string, HierarchyCrossingScope>).set(id, childScope);
    }
  }
  const orders = minimizeHierarchyCrossings(scopes.get(root)!);

  return new Map(prepared.map((scope) => [scope, orders.get(scopes.get(scope)!)!]));
}

function parsePadding(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (typeof value !== "string") {
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  }
  const padding = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const match of value.matchAll(/(top|right|bottom|left)\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
    const side = match[1] as keyof typeof padding;
    padding[side] = Number(match[2]);
  }
  return padding;
}

function parseVector(value: unknown): ElkPoint | undefined {
  if (typeof value === "object" && value !== null && "x" in value && "y" in value) {
    return { x: Number(value.x), y: Number(value.y) };
  }
  if (typeof value !== "string") return undefined;
  const match = value.match(/^\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

function applyNodeMicroLayout(
  graph: ElkNode,
  globalOptions: Readonly<Record<string, unknown>>,
): void {
  const labelPadding = parsePadding(getOption(globalOptions, "nodeLabels.padding"), 5);
  for (const node of graph.children ?? []) {
    const constraints = String(getOption(node.layoutOptions ?? {}, "nodeSize.constraints") ?? "");
    if (!constraints) continue;
    const configuredSizeOptions = getOption(node.layoutOptions ?? {}, "nodeSize.options");
    const sizeOptions = new Set(
      configuredSizeOptions === undefined
        ? ["DEFAULT_MINIMUM_SIZE"]
        : String(configuredSizeOptions)
            .split(/[\s,;]+/)
            .filter(Boolean),
    );
    const effectivelyFixedPortLabelSize =
      constraints.includes("PORT_LABELS") &&
      !constraints.includes("NODE_LABELS") &&
      !constraints.includes("MINIMUM_SIZE");
    const preserveComputedCompoundSize = (node.children?.length ?? 0) > 0;
    let width =
      effectivelyFixedPortLabelSize || preserveComputedCompoundSize ? (node.width ?? 0) : 0;
    let height =
      effectivelyFixedPortLabelSize || preserveComputedCompoundSize ? (node.height ?? 0) : 0;
    let insideHorizontalInset = 0;
    let insideVerticalInset = 0;
    const insideLabelCells = new Map<string, { width: number; height: number }>();
    if (constraints.includes("PORTS")) {
      const spacing = getNumberOption(globalOptions, "spacing.portPort") ?? 10;
      const sideCounts = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
      for (const port of node.ports ?? []) {
        const side = String(getOption(port.layoutOptions ?? {}, "port.side") ?? "EAST");
        if (side in sideCounts) sideCounts[side as keyof typeof sideCounts]++;
      }
      const nodeId = String(node.id);
      for (const edge of graph.edges ?? []) {
        const source = String(edge.sources?.[0] ?? edge.source);
        const target = String(edge.targets?.[0] ?? edge.target);
        if (source === nodeId) sideCounts.EAST++;
        if (target === nodeId) sideCounts.WEST++;
      }
      width = Math.max(width, (Math.max(sideCounts.NORTH, sideCounts.SOUTH) + 1) * spacing);
      height = Math.max(height, (Math.max(sideCounts.EAST, sideCounts.WEST) + 1) * spacing);
      if (!preserveComputedCompoundSize && sideCounts.NORTH === 0 && sideCounts.SOUTH === 0) {
        width = 0;
      }
      if (!preserveComputedCompoundSize && sideCounts.EAST === 0 && sideCounts.WEST === 0) {
        height = 0;
      }
    }
    if (constraints.includes("NODE_LABELS")) {
      for (const label of node.labels ?? []) {
        if (!label.text) continue;
        const placement = String(
          getOption(
            { ...globalOptions, ...node.layoutOptions, ...label.layoutOptions },
            "nodeLabels.placement",
          ) ?? "",
        );
        if (!placement) continue;
        const labelWidth = label.width ?? 0;
        const labelHeight = label.height ?? 0;
        if (placement.includes("OUTSIDE")) {
          if (!sizeOptions.has("OUTSIDE_NODE_LABELS_OVERHANG")) {
            width = Math.max(width, labelWidth);
          }
        } else {
          width = Math.max(width, labelWidth + labelPadding.left + labelPadding.right);
          const verticalInset =
            labelHeight * (placement.includes("V_CENTER") ? 1 : 2) +
            labelPadding.top +
            labelPadding.bottom;
          height = Math.max(height, verticalInset);
          insideHorizontalInset = Math.max(
            insideHorizontalInset,
            labelPadding.left + labelPadding.right,
          );
          insideVerticalInset = Math.max(insideVerticalInset, verticalInset);
          const row = placement.includes("V_CENTER")
            ? "center"
            : placement.includes("V_BOTTOM")
              ? "bottom"
              : "top";
          const column = placement.includes("H_CENTER")
            ? "center"
            : placement.includes("H_RIGHT")
              ? "right"
              : "left";
          const key = `${row}:${column}`;
          const cell = insideLabelCells.get(key) ?? { width: 0, height: 0 };
          cell.width = Math.max(cell.width, labelWidth);
          cell.height += labelHeight;
          insideLabelCells.set(key, cell);
        }
      }
      if (insideLabelCells.size > 0) {
        const rows = ["top", "center", "bottom"] as const;
        const columns = ["left", "center", "right"] as const;
        const cellWidth = (row: string, column: string) =>
          insideLabelCells.get(`${row}:${column}`)?.width ?? 0;
        const forceTabular = sizeOptions.has("FORCE_TABULAR_NODE_LABELS");
        const asymmetrical = sizeOptions.has("ASYMMETRICAL");
        const globalColumns = columns.map((column) =>
          Math.max(...rows.map((row) => cellWidth(row, column))),
        );
        const labelGridWidth = forceTabular
          ? globalColumns.reduce((sum, value) => sum + value, 0)
          : Math.max(
              ...rows.map((row) => {
                const left = cellWidth(row, "left");
                const center = cellWidth(row, "center");
                const right = cellWidth(row, "right");
                return asymmetrical ? left + center + right : 2 * Math.max(left, right) + center;
              }),
            );
        const labelGridHeight = rows.reduce(
          (sum, row) =>
            sum +
            Math.max(
              ...columns.map((column) => insideLabelCells.get(`${row}:${column}`)?.height ?? 0),
            ),
          0,
        );
        width = Math.max(width, labelGridWidth + labelPadding.left + labelPadding.right);
        height = Math.max(height, labelGridHeight + labelPadding.top + labelPadding.bottom);
      }
    }
    if (constraints.includes("MINIMUM_SIZE")) {
      const configuredMinimum = parseVector(
        getOption(node.layoutOptions ?? {}, "nodeSize.minimum"),
      );
      const minimum = {
        x:
          configuredMinimum?.x && configuredMinimum.x > 0
            ? configuredMinimum.x
            : sizeOptions.has("DEFAULT_MINIMUM_SIZE")
              ? 20
              : 0,
        y:
          configuredMinimum?.y && configuredMinimum.y > 0
            ? configuredMinimum.y
            : sizeOptions.has("DEFAULT_MINIMUM_SIZE")
              ? 20
              : 0,
      };
      if (sizeOptions.has("MINIMUM_SIZE_ACCOUNTS_FOR_PADDING")) {
        width = Math.max(width, minimum.x + insideHorizontalInset);
        height = Math.max(height, minimum.y + insideVerticalInset);
      } else {
        width = Math.max(width, minimum.x);
        height = Math.max(height, minimum.y);
      }
    }
    // Reading COMPUTE_PADDING is intentional: elkjs does not serialize the computed padding property.
    void sizeOptions.has("COMPUTE_PADDING");
    node.width = width;
    node.height = height;
  }
}

function getOption(options: Readonly<Record<string, unknown>>, suffix: string): unknown {
  const exactKeys = [suffix, `elk.${suffix}`, `org.eclipse.elk.${suffix}`];
  for (const key of exactKeys) {
    if (options[key] !== undefined) return options[key];
  }
  return undefined;
}

const ergonomicallyMappedLayeredSettings = new Set<keyof ElkLayeredOptionValueByName>([
  "direction",
  "padding",
  "spacing.node",
  "spacing.layer",
]);

function coerceLayeredOptionValue(value: unknown, type: string): unknown {
  if (type === "BOOLEAN") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
  }
  if (type === "DOUBLE" || type === "INT") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value);
  }
  return value;
}

function parseIndividualSpacing(value: unknown): unknown {
  if (typeof value === "object" && value !== null) return value;
  if (typeof value !== "string") return value;
  const result: Record<string, number> = {};
  for (const entry of value.split(/;,;|;/)) {
    const match = entry.match(
      /^\s*(?:org\.eclipse\.elk\.)?(?:layered\.)?([^:]+)\s*:\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (!match) continue;
    const sourceName = match[1]!;
    const definition = elkLayeredOptionDefinitions.find((candidate) => {
      const suffix = candidate.elkId.replace(/^org\.eclipse\.elk\./, "");
      return candidate.name === sourceName || suffix === sourceName;
    });
    if (definition) result[definition.name] = Number(match[2]);
  }
  return result;
}

function parseMargin(value: unknown): unknown {
  if (typeof value === "object" && value !== null) return value;
  if (typeof value !== "string") return value;
  return parsePadding(value, 0);
}

// Every accepted spelling of a layered option, with its precedence (lower wins).
const layeredOptionAliases = new Map<
  string,
  { definition: (typeof elkLayeredOptionDefinitions)[number]; rank: number }
>();
for (const definition of elkLayeredOptionDefinitions) {
  const suffix = definition.elkId.replace(/^org\.eclipse\.elk\./, "");
  [definition.name, suffix, `elk.${suffix}`, definition.elkId].forEach((key, rank) => {
    const current = layeredOptionAliases.get(key);
    if (!current || rank < current.rank) layeredOptionAliases.set(key, { definition, rank });
  });
}

const indexByIdCache = new WeakMap<
  readonly { id?: ElkId }[],
  { length: number; index: Map<string, number> }
>();

/** First element whose stringified id matches, like `find`, via a per-array index. */
function findById<T extends { id?: ElkId }>(items: readonly T[] | undefined, id: string) {
  if (!items) return undefined;
  let cached = indexByIdCache.get(items);
  if (!cached || cached.length !== items.length) {
    const index = new Map<string, number>();
    items.forEach((item, position) => {
      const key = String(item.id);
      if (!index.has(key)) index.set(key, position);
    });
    indexByIdCache.set(items, (cached = { length: items.length, index }));
  }
  const position = cached.index.get(id);
  return position === undefined ? undefined : { item: items[position]!, position };
}

function getElementLayeredSettings(
  options: Readonly<Record<string, unknown>>,
): ElkLayeredOptionValueByName {
  const settings: ElkLayeredOptionValueByName = {};
  const chosen = new Map<
    (typeof elkLayeredOptionDefinitions)[number],
    { rank: number; value: unknown }
  >();
  for (const [key, value] of Object.entries(options)) {
    const alias = layeredOptionAliases.get(key);
    if (!alias || value === undefined) continue;
    const current = chosen.get(alias.definition);
    if (!current || alias.rank < current.rank)
      chosen.set(alias.definition, { rank: alias.rank, value });
  }
  for (const [definition, { value }] of chosen) {
    const vectorMatch =
      definition.name === "port.anchor" && typeof value === "string"
        ? value.match(/^\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/)
        : undefined;
    settings[definition.name] = (
      vectorMatch
        ? { x: Number(vectorMatch[1]), y: Number(vectorMatch[2]) }
        : definition.name === "spacing.individual"
          ? parseIndividualSpacing(value)
          : definition.name === "spacing.portsSurrounding"
            ? parseMargin(value)
            : coerceLayeredOptionValue(value, definition.type)
    ) as never;
  }
  return settings;
}

function getLayeredSettings(options: Readonly<Record<string, unknown>>): LayeredAdvancedOptions {
  const settings = getElementLayeredSettings(options);
  const baseValue = settings["spacing.baseValue"];
  if (baseValue !== undefined) {
    for (const [name, defaultValue] of [
      ["spacing.componentComponent", 20],
      ["spacing.edgeEdge", 10],
      ["spacing.edgeLabel", 2],
      ["spacing.edgeNode", 10],
      ["spacing.labelLabel", 0],
      ["spacing.labelNode", 5],
      ["spacing.labelPortHorizontal", 1],
      ["spacing.labelPortVertical", 1],
      ["spacing.nodeSelfLoop", 10],
      ["spacing.portPort", 10],
      ["spacing.edgeEdgeBetweenLayers", 10],
      ["spacing.edgeNodeBetweenLayers", 10],
    ] as const) {
      settings[name] ??= (baseValue * defaultValue) / 20;
    }
  }
  for (const name of ergonomicallyMappedLayeredSettings) delete settings[name];
  return settings as LayeredAdvancedOptions;
}

function getNumberOption(
  options: Readonly<Record<string, unknown>>,
  suffix: string,
): number | undefined {
  const value = getOption(options, suffix);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getBooleanOption(
  options: Readonly<Record<string, unknown>>,
  suffix: string,
): boolean | undefined {
  const value = getOption(options, suffix);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function getDirection(
  options: Readonly<Record<string, unknown>>,
): "up" | "down" | "left" | "right" {
  const direction = String(getOption(options, "direction") ?? "RIGHT").toLowerCase();
  return direction === "up" || direction === "left" || direction === "down" ? direction : "right";
}

function endpoint(
  value: unknown,
  portOwnerById: ReadonlyMap<string, string>,
): { nodeId: string; port?: string } {
  const id = String(value);
  const ownerId = portOwnerById.get(id);
  return ownerId === undefined ? { nodeId: id } : { nodeId: ownerId, port: id };
}

function isInsideSelfLoop(root: ElkNode, edge: ElkEdge, expectedNodeId?: string): boolean {
  const source = String(edge.sources?.[0] ?? edge.source);
  const target = String(edge.targets?.[0] ?? edge.target);
  if (source !== target || (expectedNodeId !== undefined && source !== expectedNodeId))
    return false;
  const node = root.children?.find((child) => String(child.id) === source);
  return (
    getBooleanOption(node?.layoutOptions ?? {}, "insideSelfLoops.activate") === true &&
    getBooleanOption(edge.layoutOptions ?? {}, "insideSelfLoops.yo") === true
  );
}

function applyInsideSelfLoops(
  root: ElkNode,
  baseHeightByNodeId: ReadonlyMap<string, number>,
): void {
  const indexByNodeId = new Map<string, number>();
  for (const edge of root.edges ?? []) {
    if (!isInsideSelfLoop(root, edge)) continue;
    const nodeId = String(edge.sources?.[0] ?? edge.source);
    const node = root.children?.find((child) => String(child.id) === nodeId);
    const baseHeight = baseHeightByNodeId.get(nodeId);
    if (!node || baseHeight === undefined) continue;
    const index = indexByNodeId.get(nodeId) ?? 0;
    indexByNodeId.set(nodeId, index + 1);
    const y = (node.y ?? 0) + baseHeight - 2 + index * 11;
    edge.sections = [
      {
        id: `${String(edge.id)}_s0`,
        startPoint: { x: node.x ?? 0, y },
        endPoint: { x: (node.x ?? 0) + (node.width ?? 0), y },
        incomingShape: edge.sources?.[0] ?? edge.source,
        outgoingShape: edge.targets?.[0] ?? edge.target,
      },
    ];
  }
}

function toGraph(root: ElkNode, globalOptions: Readonly<Record<string, unknown>> = {}): Graph {
  const children = (root.children ?? []).filter(
    (child) => getBooleanOption(child.layoutOptions ?? {}, "noLayout") !== true,
  );
  const nodeIds = new Set(children.map((child) => String(child.id)));
  const portOwnerById = new Map<string, string>();
  for (const child of children) {
    for (const port of child.ports ?? []) {
      if (port.id !== undefined) portOwnerById.set(String(port.id), String(child.id));
    }
  }
  const sourcePortIds = new Set(
    (root.edges ?? []).flatMap((edge) =>
      (edge.sources ?? (edge.source === undefined ? [] : [edge.source])).map(String),
    ),
  );
  const targetPortIds = new Set(
    (root.edges ?? []).flatMap((edge) =>
      (edge.targets ?? (edge.target === undefined ? [] : [edge.target])).map(String),
    ),
  );
  const sourcePortDegree = new Map<string, number>();
  const targetPortDegree = new Map<string, number>();
  const edgeModelOrderByPortId = new Map<string, number>();
  for (const [edgeIndex, edge] of (root.edges ?? []).entries()) {
    for (const source of edge.sources ?? (edge.source === undefined ? [] : [edge.source])) {
      const id = String(source);
      sourcePortDegree.set(id, (sourcePortDegree.get(id) ?? 0) + 1);
      if (portOwnerById.has(id) && !edgeModelOrderByPortId.has(id)) {
        edgeModelOrderByPortId.set(id, edgeIndex);
      }
    }
    for (const target of edge.targets ?? (edge.target === undefined ? [] : [edge.target])) {
      const id = String(target);
      targetPortDegree.set(id, (targetPortDegree.get(id) ?? 0) + 1);
      if (portOwnerById.has(id) && !edgeModelOrderByPortId.has(id)) {
        edgeModelOrderByPortId.set(id, edgeIndex);
      }
    }
  }
  const orderedPorts = (child: ElkNode) => {
    const ports = [...(child.ports ?? [])];
    if (String(getOption(child.layoutOptions ?? {}, "portConstraints")) !== "FIXED_SIDE") {
      return ports;
    }
    const canonicalSides: Record<string, string> =
      getDirection(globalOptions) === "left"
        ? { NORTH: "NORTH", EAST: "WEST", SOUTH: "SOUTH", WEST: "EAST" }
        : getDirection(globalOptions) === "down"
          ? { NORTH: "WEST", EAST: "SOUTH", SOUTH: "EAST", WEST: "NORTH" }
          : getDirection(globalOptions) === "up"
            ? { NORTH: "EAST", EAST: "SOUTH", SOUTH: "WEST", WEST: "NORTH" }
            : { NORTH: "NORTH", EAST: "EAST", SOUTH: "SOUTH", WEST: "WEST" };
    const side = (port: ElkPort) =>
      canonicalSides[String(getOption(port.layoutOptions ?? {}, "port.side"))] ?? "UNDEFINED";
    const sideOrder = ["NORTH", "EAST", "SOUTH", "WEST"];
    ports.sort((left, right) => {
      const leftSide = side(left);
      const rightSide = side(right);
      const sideDifference = sideOrder.indexOf(leftSide) - sideOrder.indexOf(rightSide);
      if (sideDifference !== 0) return sideDifference;
      if (String(getOption(globalOptions, "layered.portSortingStrategy")) === "PORT_DEGREE") {
        if (leftSide === "EAST") {
          return (
            (sourcePortDegree.get(String(right.id)) ?? 0) -
            (sourcePortDegree.get(String(left.id)) ?? 0)
          );
        }
        if (leftSide === "WEST") {
          return (
            (targetPortDegree.get(String(left.id)) ?? 0) -
            (targetPortDegree.get(String(right.id)) ?? 0)
          );
        }
      }
      const modelOrderStrategy = String(
        getOption(globalOptions, "layered.considerModelOrder.strategy") ?? "NONE",
      );
      const usePortModelOrder =
        getBooleanOption(globalOptions, "layered.considerModelOrder.portModelOrder") === true;
      if (modelOrderStrategy !== "NONE" && !usePortModelOrder) {
        const leftOrder = edgeModelOrderByPortId.get(String(left.id));
        const rightOrder = edgeModelOrderByPortId.get(String(right.id));
        // Ports without edges order last and keep their order among themselves,
        // unreversed even on the WEST side, as ELK does.
        if (leftOrder === undefined && rightOrder === undefined) return 0;
        if (leftOrder !== rightOrder) return (leftOrder ?? Infinity) - (rightOrder ?? Infinity);
      }
      const direction = leftSide === "WEST" ? -1 : 1;
      return direction * ((child.ports?.indexOf(left) ?? 0) - (child.ports?.indexOf(right) ?? 0));
    });
    return ports;
  };

  const native = createGraph({
    id: String(root.id),
    nodes: children.map((child) => ({
      id: String(child.id),
      x: child.x,
      y: child.y,
      ...parsePosition(getOption(child.layoutOptions ?? {}, "position")),
      width: child.width,
      height: child.height,
      label: child.labels?.[0]?.text,
      ports: orderedPorts(child)
        .filter((port) => getBooleanOption(port.layoutOptions ?? {}, "noLayout") !== true)
        .map((port) => ({
          name: String(port.id),
          direction: sourcePortIds.has(String(port.id))
            ? targetPortIds.has(String(port.id))
              ? ("inout" as const)
              : ("out" as const)
            : targetPortIds.has(String(port.id))
              ? ("in" as const)
              : ("inout" as const),
          x: port.x,
          y: port.y,
          width: port.width,
          height: port.height,
        })),
    })),
    edges: (root.edges ?? []).flatMap((edge) => {
      if (getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true) return [];
      if (isInsideSelfLoop(root, edge)) return [];
      const source = endpoint(edge.sources?.[0] ?? edge.source, portOwnerById);
      const target = endpoint(edge.targets?.[0] ?? edge.target, portOwnerById);
      const labels = (edge.labels ?? []).filter(isLayoutEdgeLabel);
      const labelLabelSpacing = getNumberOption(globalOptions, "spacing.labelLabel") ?? 0;
      const labelWidth = Math.max(0, ...labels.map((label) => label.width ?? 0));
      const labelHeight =
        labels.reduce((sum, label) => sum + (label.height ?? 0), 0) +
        Math.max(0, labels.length - 1) * labelLabelSpacing;
      return nodeIds.has(source.nodeId) && nodeIds.has(target.nodeId)
        ? [
            {
              id: String(edge.id),
              sourceId: source.nodeId,
              targetId: target.nodeId,
              sourcePort: source.port,
              targetPort: target.port,
              label: edge.labels?.[0]?.text,
              width: labelWidth,
              height: labelHeight,
              points: parsePoints(getOption(edge.layoutOptions ?? {}, "bendPoints")),
            },
          ]
        : [];
    }),
  });
  for (const node of native.nodes) {
    const child = children.find((candidate) => String(candidate.id) === node.id);
    const origin = child && externalPortDummyOf(child);
    if (origin) attachExternalPortDummy(node, origin);
  }
  return native;
}

function parsePoints(value: unknown): ElkPoint[] | undefined {
  if (typeof value !== "string") return undefined;
  const points = [...value.matchAll(/\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/g)].map(
    (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
  );
  return points.length > 0 ? points : undefined;
}

function parsePosition(value: unknown): ElkPoint | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

function toSection(edge: ElkEdge, points: readonly ElkPoint[]) {
  const startPoint = points[0];
  const endPoint = points.at(-1);
  if (!startPoint || !endPoint) return undefined;
  return {
    id: `${String(edge.id)}_s0`,
    startPoint: { ...startPoint },
    endPoint: { ...endPoint },
    incomingShape: edge.sources?.[0] ?? edge.source,
    outgoingShape: edge.targets?.[0] ?? edge.target,
    ...(points.length > 2
      ? { bendPoints: points.slice(1, -1).map((point) => ({ ...point })) }
      : {}),
  };
}

function applyLayout(
  root: ElkNode,
  graph: VisualGraph,
  padding: { top: number; right: number; bottom: number; left: number },
  layoutOptions: Readonly<Record<string, unknown>>,
  resultPolicy?: Elkjs0111ResultPolicy,
): void {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const child of root.children ?? []) {
    const node = nodeById.get(String(child.id));
    if (!node) continue;
    child.x = node.x;
    child.y = node.y;
    child.width = node.width;
    child.height = node.height;
    placeNodeLabels(child, layoutOptions);
    for (const port of child.ports ?? []) {
      if (getBooleanOption(port.layoutOptions ?? {}, "noLayout") === true) continue;
      const laidOutPort = node.ports?.find((candidate) => candidate.name === String(port.id));
      if (!laidOutPort) continue;
      port.x = laidOutPort.x;
      port.y = laidOutPort.y;
      port.width = laidOutPort.width;
      port.height = laidOutPort.height;
    }
    placePortLabels(child, layoutOptions);
  }
  for (const edge of root.edges ?? []) {
    if (resultPolicy?.preserveEdgeSections) {
      for (const section of edge.sections ?? []) {
        section.incomingShape ??= edge.sources?.[0] ?? edge.source;
        section.outgoingShape ??= edge.targets?.[0] ?? edge.target;
      }
      continue;
    }
    const laidOutEdge = edgeById.get(String(edge.id));
    if (!laidOutEdge) {
      if (getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true) {
        for (const section of edge.sections ?? []) {
          section.incomingShape ??= edge.sources?.[0] ?? edge.source;
          section.outgoingShape ??= edge.targets?.[0] ?? edge.target;
        }
        continue;
      }
      const section = getParentEdgeSection(root, edge);
      if (section) {
        edge.sections = [section];
        edge.container = root.id;
      }
      continue;
    }
    const nativeJunctions = resultPolicy?.junctionPointsByEdgeId?.get(String(edge.id));
    if (nativeJunctions) {
      if (nativeJunctions.length)
        edge.junctionPoints = nativeJunctions.map((point) => ({ ...point }));
      else delete edge.junctionPoints;
    }
    const section = toSection(edge, laidOutEdge.points ?? []);
    edge.sections = section ? [section] : [];
    if (section) edge.container = root.id;
    const target = root.children?.find(
      (child) => String(child.id) === String(edge.targets?.[0] ?? edge.target),
    );
    if (
      getBooleanOption(target?.layoutOptions ?? {}, "hypernode") === true &&
      (section?.bendPoints?.length ?? 0) > 0
    ) {
      edge.junctionPoints = [section!.bendPoints!.at(-1)!];
    }
    let labelY = laidOutEdge.y ?? 0;
    const points = laidOutEdge.points ?? [];
    const firstPoint = points[0] ?? { x: laidOutEdge.x ?? 0, y: laidOutEdge.y ?? 0 };
    const lastPoint = points.at(-1) ?? firstPoint;
    const midpointX = (laidOutEdge.x ?? 0) + (laidOutEdge.width ?? 0) / 2;
    const edgeLabelSpacing = getNumberOption(layoutOptions, "spacing.edgeLabel") ?? 2;
    const labelLabelSpacing = getNumberOption(layoutOptions, "spacing.labelLabel") ?? 0;
    // A lone label keeps the native position, which already avoids collisions.
    const loneLabel = (edge.labels ?? []).filter(isLayoutEdgeLabel).length === 1;
    for (const label of edge.labels ?? []) {
      if (getBooleanOption(label.layoutOptions ?? {}, "noLayout") === true) {
        label.x ??= 0;
        label.y ??= 0;
        continue;
      }
      if (!isLayoutEdgeLabel(label)) {
        label.x ??= 0;
        label.y ??= 0;
        continue;
      }
      const placement = String(
        getOption(label.layoutOptions ?? {}, "edgeLabels.placement") ?? "CENTER",
      );
      const width = label.width ?? 0;
      label.x =
        loneLabel && placement !== "CENTER" && laidOutEdge.x !== undefined
          ? laidOutEdge.x
          : placement === "TAIL"
            ? firstPoint.x + edgeLabelSpacing
            : placement === "HEAD"
              ? lastPoint.x - width - edgeLabelSpacing
              : midpointX - width / 2;
      label.y = labelY;
      labelY += (label.height ?? 0) + labelLabelSpacing;
    }
  }
  if (!resultPolicy?.skipBoundsNormalization) {
    normalizeElkGraphBounds(
      root,
      padding,
      layoutOptions,
      resultPolicy?.normalizationBounds,
      resultPolicy?.placementCrossBounds,
    );
  }
  if (
    !resultPolicy?.preserveEdgeSections &&
    String(getOption(layoutOptions, "edgeRouting") ?? "ORTHOGONAL") === "ORTHOGONAL"
  ) {
    const direction = getDirection(layoutOptions);
    applyOrthogonalJunctions(
      root,
      direction === "right" || direction === "left",
      direction === "right" || direction === "down",
      getBooleanOption(layoutOptions, "layered.mergeEdges") === true,
      new Set(
        (root.children ?? [])
          .filter((n) => getBooleanOption(n.layoutOptions ?? {}, "hypernode") === true)
          .map((n) => String(n.id)),
      ),
      new Set(
        (root.edges ?? [])
          .filter(
            (e) =>
              getBooleanOption(e.layoutOptions ?? {}, "noLayout") === true ||
              resultPolicy?.junctionPointsByEdgeId?.has(String(e.id)) === true,
          )
          .map((e) => String(e.id)),
      ),
    );
  }
}

function normalizeElkGraphBounds(
  root: ElkNode,
  padding: { top: number; right: number; bottom: number; left: number },
  layoutOptions: Readonly<Record<string, unknown>> = {},
  compactionBounds?: Elkjs0111ResultPolicy["normalizationBounds"],
  placementCrossBounds?: Elkjs0111ResultPolicy["placementCrossBounds"],
): void {
  // Edge coordinates belong to their layout container, not their JSON storage owner.
  const layoutEdges = (root.edges ?? []).filter(
    (edge) => edge.container == null || String(edge.container) === String(root.id),
  );
  const authoredWidth = root.width;
  const authoredHeight = root.height;
  const fixedGraphSize = getBooleanOption(layoutOptions, "nodeSize.fixedGraphSize") === true;
  const layoutChildren = (root.children ?? []).filter(
    (node) => getBooleanOption(node.layoutOptions ?? {}, "noLayout") !== true,
  );
  let minimumX = compactionBounds?.left ?? Number.POSITIVE_INFINITY;
  let minimumY = compactionBounds?.top ?? Number.POSITIVE_INFINITY;
  for (const node of layoutChildren) {
    minimumX = Math.min(
      minimumX,
      node.x ?? 0,
      ...(node.labels ?? []).map((label) => (node.x ?? 0) + (label.x ?? 0)),
      ...(node.ports ?? []).map((port) => (node.x ?? 0) + (port.x ?? 0)),
      ...(node.ports ?? []).flatMap((port) =>
        (port.labels ?? []).map((label) => (node.x ?? 0) + (port.x ?? 0) + (label.x ?? 0)),
      ),
    );
    minimumY = Math.min(
      minimumY,
      node.y ?? 0,
      ...(node.labels ?? []).map((label) => (node.y ?? 0) + (label.y ?? 0)),
      ...(node.ports ?? []).map((port) => (node.y ?? 0) + (port.y ?? 0)),
      ...(node.ports ?? []).flatMap((port) =>
        (port.labels ?? []).map((label) => (node.y ?? 0) + (port.y ?? 0) + (label.y ?? 0)),
      ),
    );
  }
  for (const edge of layoutEdges) {
    const laidOutLabels = (edge.labels ?? []).filter(isLayoutEdgeLabel);
    minimumX = Math.min(minimumX, ...laidOutLabels.map((label) => label.x ?? 0));
    minimumY = Math.min(minimumY, ...laidOutLabels.map((label) => label.y ?? 0));
    if (getBooleanOption(edge.layoutOptions ?? {}, "noLayout") !== true) {
      const points = (edge.sections ?? []).flatMap((section) => [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]);
      minimumX = Math.min(minimumX, ...points.map((point) => point.x));
      minimumY = Math.min(minimumY, ...points.map((point) => point.y));
    }
  }
  const shiftX = Number.isFinite(minimumX) ? Math.max(0, padding.left - minimumX) : 0;
  const shiftY = Number.isFinite(minimumY) ? Math.max(0, padding.top - minimumY) : 0;
  if (shiftX !== 0 || shiftY !== 0) {
    for (const node of layoutChildren) {
      node.x = (node.x ?? 0) + shiftX;
      node.y = (node.y ?? 0) + shiftY;
    }
    for (const edge of layoutEdges) {
      for (const section of edge.sections ?? []) {
        for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
          point.x += shiftX;
          point.y += shiftY;
        }
      }
      for (const point of edge.junctionPoints ?? []) {
        point.x += shiftX;
        point.y += shiftY;
      }
      for (const label of (edge.labels ?? []).filter(isLayoutEdgeLabel)) {
        label.x = (label.x ?? 0) + shiftX;
        label.y = (label.y ?? 0) + shiftY;
      }
    }
  }
  const maximumNodeX = Math.max(
    0,
    ...layoutChildren.map((node) => (node.x ?? 0) + (node.width ?? 0)),
  );
  const maximumNodeY = Math.max(
    0,
    ...layoutChildren.map((node) => (node.y ?? 0) + (node.height ?? 0)),
  );
  const layoutEdgePoints = layoutEdges.flatMap((edge) =>
    getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true
      ? []
      : (edge.sections ?? []).flatMap((section) => [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ]),
  );
  const wrappingStrategy = String(getOption(layoutOptions, "layered.wrapping.strategy") ?? "OFF");
  const direction = getDirection(layoutOptions);
  const laidOutChildById = new Map((root.children ?? []).map((child) => [String(child.id), child]));
  const childByEndpointId = new Map(laidOutChildById);
  for (const child of root.children ?? []) {
    for (const port of child.ports ?? []) childByEndpointId.set(String(port.id), child);
  }
  const wrappedEdgeCount = layoutEdges.filter((edge) => {
    const source = childByEndpointId.get(String(edge.sources?.[0] ?? edge.source));
    const target = childByEndpointId.get(String(edge.targets?.[0] ?? edge.target));
    if (!source || !target) return false;
    return direction === "right"
      ? (source.x ?? 0) > (target.x ?? 0)
      : direction === "left"
        ? (source.x ?? 0) < (target.x ?? 0)
        : direction === "down"
          ? (source.y ?? 0) > (target.y ?? 0)
          : (source.y ?? 0) < (target.y ?? 0);
  }).length;
  const hasWrappedEdge = wrappedEdgeCount > 0;
  const retainPlacementBounds =
    wrappingStrategy !== "MULTI_EDGE" &&
    !(wrappingStrategy === "SINGLE_EDGE" && hasWrappedEdge) &&
    String(getOption(layoutOptions, "layered.compaction.postCompaction.strategy") ?? "NONE") ===
      "NONE" &&
    getBooleanOption(layoutOptions, "layered.feedbackEdges") !== true &&
    String(getOption(layoutOptions, "layered.layering.nodePromotion.strategy") ?? "NONE") !==
      "MODEL_ORDER_LEFT_TO_RIGHT";
  // Actual helper extents survive nested scopes. The legacy route-pixel
  // allowance still excludes compound scopes.
  const addBoundaryPixel =
    retainPlacementBounds &&
    !(root.children ?? []).some((child) => (child.children?.length ?? 0) > 0);
  // Prefer the retained placement extent on the cross axis. Other placers
  // retain the legacy route-bound allowance until they expose phase bounds.
  // Loop envelopes own their bounds. Ordinary long-edge dummies still have
  // a one-pixel cross-axis extent when another edge in the graph is a loop.
  // Apply that allowance to route points, before unioning labels and margins.
  const isSelfLoop = (edge: ElkEdge) => {
    const source = childByEndpointId.get(String(edge.sources?.[0] ?? edge.source));
    return (
      source !== undefined &&
      source === childByEndpointId.get(String(edge.targets?.[0] ?? edge.target))
    );
  };
  const hasSelfLoops = layoutEdges.some(isSelfLoop);
  const edgeBoundsExtraX =
    addBoundaryPixel &&
    placementCrossBounds?.axis !== "x" &&
    !(hasSelfLoops && (direction === "right" || direction === "left")) &&
    layoutEdgePoints.length > 0 &&
    Math.max(...layoutEdgePoints.map((point) => point.x)) >= maximumNodeX - 1e-9
      ? 1
      : 0;
  const edgeBoundsExtraY =
    addBoundaryPixel &&
    placementCrossBounds?.axis !== "y" &&
    !(hasSelfLoops && (direction === "down" || direction === "up")) &&
    layoutEdgePoints.length > 0 &&
    Math.max(...layoutEdgePoints.map((point) => point.y)) >= maximumNodeY - 1e-9
      ? 1
      : 0;
  const singleMultiEdgeCutBoundsExtraY =
    wrappingStrategy === "MULTI_EDGE" &&
    wrappedEdgeCount === 1 &&
    layoutEdgePoints.length > 0 &&
    Math.max(...layoutEdgePoints.map((point) => point.y)) >= maximumNodeY - 1e-9
      ? 1
      : 0;
  const postCompactionBoundsExtraX =
    !compactionBounds &&
    !addBoundaryPixel &&
    !hasWrappedEdge &&
    String(getOption(layoutOptions, "layered.compaction.postCompaction.strategy") ?? "NONE") !==
      "NONE" &&
    layoutEdgePoints.length > 0 &&
    Math.max(...layoutEdgePoints.map((point) => point.x)) > maximumNodeX + 1e-9
      ? 0.04
      : 0;
  const postCompactionBoundsExtraY =
    !compactionBounds &&
    !addBoundaryPixel &&
    !hasWrappedEdge &&
    String(getOption(layoutOptions, "layered.compaction.postCompaction.strategy") ?? "NONE") !==
      "NONE" &&
    layoutEdgePoints.length > 0 &&
    Math.max(...layoutEdgePoints.map((point) => point.y)) > maximumNodeY + 1e-9
      ? 0.04
      : 0;
  const calculatedWidth =
    Math.max(
      compactionBounds ? compactionBounds.right + shiftX : 0,
      retainPlacementBounds && placementCrossBounds?.axis === "x"
        ? placementCrossBounds.maximum + shiftX
        : 0,
      ...layoutChildren.flatMap((node) => [
        (node.x ?? 0) + (node.width ?? 0),
        ...(node.labels ?? []).map((label) => (node.x ?? 0) + (label.x ?? 0) + (label.width ?? 0)),
        ...(node.ports ?? []).map((port) => (node.x ?? 0) + (port.x ?? 0) + (port.width ?? 0)),
        ...(node.ports ?? []).flatMap((port) =>
          (port.labels ?? []).map(
            (label) => (node.x ?? 0) + (port.x ?? 0) + (label.x ?? 0) + (label.width ?? 0),
          ),
        ),
      ]),
      ...layoutEdges.flatMap((edge) =>
        (edge.labels ?? [])
          .filter(isLayoutEdgeLabel)
          .map((label) => (label.x ?? 0) + (label.width ?? 0)),
      ),
      ...layoutEdges.flatMap((edge) =>
        getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true
          ? []
          : (edge.sections ?? []).flatMap((section) => [
              section.startPoint.x + (isSelfLoop(edge) ? 0 : edgeBoundsExtraX),
              ...(section.bendPoints ?? []).map(
                (point) => point.x + (isSelfLoop(edge) ? 0 : edgeBoundsExtraX),
              ),
              section.endPoint.x + (isSelfLoop(edge) ? 0 : edgeBoundsExtraX),
            ]),
      ),
    ) +
    padding.right +
    postCompactionBoundsExtraX +
    (getBooleanOption(layoutOptions, "layered.feedbackEdges") === true &&
    (getDirection(layoutOptions) === "down" || getDirection(layoutOptions) === "up")
      ? 1
      : 0);
  const calculatedHeight =
    Math.max(
      compactionBounds ? compactionBounds.bottom + shiftY : 0,
      retainPlacementBounds && placementCrossBounds?.axis === "y"
        ? placementCrossBounds.maximum + shiftY
        : 0,
      ...layoutChildren.flatMap((node) => [
        (node.y ?? 0) + (node.height ?? 0),
        ...(node.labels ?? []).map((label) => (node.y ?? 0) + (label.y ?? 0) + (label.height ?? 0)),
        ...(node.ports ?? []).map((port) => (node.y ?? 0) + (port.y ?? 0) + (port.height ?? 0)),
        ...(node.ports ?? []).flatMap((port) =>
          (port.labels ?? []).map(
            (label) => (node.y ?? 0) + (port.y ?? 0) + (label.y ?? 0) + (label.height ?? 0),
          ),
        ),
      ]),
      ...layoutEdges.flatMap((edge) =>
        (edge.labels ?? [])
          .filter(isLayoutEdgeLabel)
          .map(
            (label) =>
              (label.y ?? 0) +
              (label.height ?? 0) +
              (String(getOption(label.layoutOptions ?? {}, "edgeLabels.placement") ?? "CENTER") ===
                "CENTER" &&
              childByEndpointId.get(String(edge.sources?.[0] ?? edge.source)) !==
                childByEndpointId.get(String(edge.targets?.[0] ?? edge.target))
                ? 1
                : 0),
          ),
      ),
      ...layoutEdges.flatMap((edge) =>
        getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true
          ? []
          : (edge.sections ?? []).flatMap((section) => [
              section.startPoint.y + (isSelfLoop(edge) ? 0 : edgeBoundsExtraY),
              ...(section.bendPoints ?? []).map(
                (point) => point.y + (isSelfLoop(edge) ? 0 : edgeBoundsExtraY),
              ),
              section.endPoint.y + (isSelfLoop(edge) ? 0 : edgeBoundsExtraY),
            ]),
      ),
    ) +
    padding.bottom +
    singleMultiEdgeCutBoundsExtraY +
    postCompactionBoundsExtraY +
    (getBooleanOption(layoutOptions, "layered.feedbackEdges") === true &&
    (getDirection(layoutOptions) === "right" || getDirection(layoutOptions) === "left")
      ? 1
      : 0);
  root.width = fixedGraphSize ? (authoredWidth ?? 0) : calculatedWidth;
  root.height = fixedGraphSize ? (authoredHeight ?? 0) : calculatedHeight;
}

function getParentEdgeSection(root: ElkNode, edge: ElkEdge) {
  const sourceId = String(edge.sources?.[0] ?? edge.source);
  const targetId = String(edge.targets?.[0] ?? edge.target);
  const rootId = String(root.id);
  const source = root.children?.find((child) => String(child.id) === sourceId);
  const target = root.children?.find((child) => String(child.id) === targetId);
  if (source && targetId === rootId) {
    const startPoint = {
      x: (source.x ?? 0) + (source.width ?? 0) / 2,
      y: (source.y ?? 0) + (source.height ?? 0),
    };
    return {
      id: `${String(edge.id)}_s0`,
      startPoint,
      endPoint: { x: startPoint.x, y: 0 },
    };
  }
  if (sourceId === rootId && target) {
    const endPoint = {
      x: (target.x ?? 0) + (target.width ?? 0) / 2,
      y: target.y ?? 0,
    };
    return {
      id: `${String(edge.id)}_s0`,
      startPoint: { x: endPoint.x, y: 0 },
      endPoint,
    };
  }
  return undefined;
}

function placeNodeLabels(node: ElkNode, globalOptions: Readonly<Record<string, unknown>>): void {
  const labelPadding = parsePadding(getOption(globalOptions, "nodeLabels.padding"), 5);
  for (const label of node.labels ?? []) {
    if (!label.text) continue;
    if (getBooleanOption(label.layoutOptions ?? {}, "noLayout") === true) continue;
    const placement = String(
      getOption(
        { ...globalOptions, ...node.layoutOptions, ...label.layoutOptions },
        "nodeLabels.placement",
      ) ?? "",
    );
    if (!placement) continue;
    const width = label.width ?? 0;
    const height = label.height ?? 0;
    const nodeWidth = node.width ?? 0;
    const nodeHeight = node.height ?? 0;
    label.x = placement.includes("H_CENTER")
      ? (nodeWidth - width + labelPadding.left - labelPadding.right) / 2
      : placement.includes("H_RIGHT")
        ? nodeWidth - width - labelPadding.right
        : labelPadding.left;
    if (placement.includes("OUTSIDE") && placement.includes("V_TOP")) {
      label.y = -height - Number(getOption(globalOptions, "spacing.labelNode") ?? 5);
    } else if (placement.includes("OUTSIDE") && placement.includes("V_BOTTOM")) {
      label.y = nodeHeight + Number(getOption(globalOptions, "spacing.labelNode") ?? 5);
    } else if (placement.includes("V_CENTER")) {
      label.y = (nodeHeight - height + labelPadding.top - labelPadding.bottom) / 2;
    } else if (placement.includes("V_BOTTOM")) {
      label.y = nodeHeight - height - labelPadding.bottom;
    } else {
      label.y = labelPadding.top;
    }
  }
}

function placePortLabels(node: ElkNode, globalOptions: Readonly<Record<string, unknown>>): void {
  const placement = String(
    getOption({ ...globalOptions, ...node.layoutOptions }, "portLabels.placement") ?? "OUTSIDE",
  );
  const inside = placement.includes("INSIDE");
  const alwaysOtherSide = placement.includes("ALWAYS_OTHER_SAME_SIDE");
  const spaceEfficient =
    placement.includes("SPACE_EFFICIENT") ||
    String(getOption(node.layoutOptions ?? {}, "nodeSize.options") ?? "").includes(
      "SPACE_EFFICIENT_PORT_LABELS",
    );
  const horizontalSpacing = getNumberOption(globalOptions, "spacing.labelPortHorizontal") ?? 1;
  const verticalSpacing = getNumberOption(globalOptions, "spacing.labelPortVertical") ?? 1;
  const labelSpacing = getNumberOption(globalOptions, "spacing.labelLabel") ?? 0;
  const treatAsGroup =
    getBooleanOption(node.layoutOptions ?? {}, "portLabels.treatAsGroup") ?? false;
  const placeNextToPort =
    placement.includes("NEXT_TO_PORT_IF_POSSIBLE") ||
    getBooleanOption(node.layoutOptions ?? {}, "portLabels.nextToPortIfPossible") === true;
  const nodeWidth = node.width ?? 0;
  for (const port of node.ports ?? []) {
    if (getBooleanOption(port.layoutOptions ?? {}, "noLayout") === true) continue;
    const portWidth = port.width ?? 0;
    const portHeight = port.height ?? 0;
    const side =
      (port.x ?? 0) < 0
        ? "WEST"
        : (port.x ?? 0) >= nodeWidth
          ? "EAST"
          : (port.y ?? 0) < 0
            ? "NORTH"
            : "SOUTH";
    const portsOnSide = (node.ports ?? []).filter((candidate) => {
      const candidateSide =
        (candidate.x ?? 0) < 0
          ? "WEST"
          : (candidate.x ?? 0) >= nodeWidth
            ? "EAST"
            : (candidate.y ?? 0) < 0
              ? "NORTH"
              : "SOUTH";
      return candidateSide === side;
    });
    const labels = (port.labels ?? []).filter(
      (label) =>
        Boolean(label.text) && getBooleanOption(label.layoutOptions ?? {}, "noLayout") !== true,
    );
    const totalLabelHeight =
      labels.reduce((sum, label) => sum + (label.height ?? 0), 0) +
      Math.max(0, labels.length - 1) * labelSpacing;
    let stackedY =
      labels.length > 1
        ? inside || placeNextToPort
          ? treatAsGroup
            ? (portHeight - totalLabelHeight) / 2
            : (portHeight - (labels[0]?.height ?? 0)) / 2
          : portHeight + verticalSpacing
        : undefined;
    for (const label of labels) {
      if (!label.text) continue;
      const width = label.width ?? 0;
      const height = label.height ?? 0;
      if (side === "EAST") {
        label.x = inside ? -width - horizontalSpacing : portWidth + horizontalSpacing;
        label.y =
          stackedY ??
          (inside || placeNextToPort
            ? (portHeight - height) / 2
            : alwaysOtherSide
              ? -height - verticalSpacing
              : portHeight + verticalSpacing);
      } else if (side === "WEST") {
        label.x = inside ? portWidth + horizontalSpacing : -width - horizontalSpacing;
        label.y =
          stackedY ??
          (inside || placeNextToPort
            ? (portHeight - height) / 2
            : alwaysOtherSide
              ? -height - verticalSpacing
              : portHeight + verticalSpacing);
      } else if (side === "NORTH") {
        label.x =
          inside || placeNextToPort
            ? (portWidth - width) / 2
            : alwaysOtherSide
              ? -width - horizontalSpacing
              : portWidth + horizontalSpacing;
        label.y = inside ? portHeight + verticalSpacing : -height - verticalSpacing;
      } else {
        label.x =
          inside || placeNextToPort
            ? (portWidth - width) / 2
            : alwaysOtherSide
              ? -width - horizontalSpacing
              : portWidth + horizontalSpacing;
        label.y = inside ? -height - verticalSpacing : portHeight + verticalSpacing;
      }
      if (
        spaceEfficient &&
        portsOnSide[0] === port &&
        portsOnSide.length >= 2 &&
        !placeNextToPort
      ) {
        if (side === "EAST" || side === "WEST") label.y = -height - verticalSpacing;
        else label.x = -width - horizontalSpacing;
      }
      if (stackedY !== undefined) stackedY += height + labelSpacing;
    }
  }
}

export { compileStatechartLayout, layoutStatechart, scoreStatechartLayout } from "./statechart";
export type {
  StatechartScope,
  StatechartLayoutOptions,
  StatechartLayoutScore,
  StatechartLayoutPlan,
} from "./statechart";

export { getElkRoutes } from "./routes";
export type { ElkRouteOptions } from "./routes";

/** Edges crossing `group`, in the order ELK's CompoundGraphPreprocessor creates its boundary ports. */
function elkBoundaryEdgeOrder(
  group: ElkNode,
  scope: ElkNode,
  originals: ReadonlyMap<ElkEdge, { sourceId: string; targetId: string }>,
): ElkEdge[] {
  const edges: ElkEdge[] = [];
  const collect = (node: ElkNode) => {
    edges.push(...(node.edges ?? []));
    for (const child of node.children ?? []) collect(child);
  };
  collect(scope);
  const endpoints = (edge: ElkEdge) =>
    originals.get(edge) ?? {
      sourceId: String(edge.sources?.[0] ?? edge.source),
      targetId: String(edge.targets?.[0] ?? edge.target),
    };
  const order = (node: ElkNode): ElkEdge[] => {
    const inside = new Set<string>();
    const mark = (parent: ElkNode) => {
      for (const child of parent.children ?? []) {
        inside.add(String(child.id));
        for (const port of child.ports ?? []) inside.add(String(port.id));
        mark(child);
      }
    };
    mark(node);
    const leaves = (edge: ElkEdge) =>
      inside.has(endpoints(edge).sourceId) !== inside.has(endpoints(edge).targetId);
    const result = new Set<ElkEdge>();
    for (const child of node.children ?? [])
      if (child.children?.length)
        for (const edge of order(child)) if (leaves(edge)) result.add(edge);
    for (const child of node.children ?? []) {
      for (const port of [...(child.ports ?? []).map((p) => String(p.id)), String(child.id)]) {
        for (const edge of edges)
          if (endpoints(edge).sourceId === port && leaves(edge)) result.add(edge);
        for (const edge of edges)
          if (endpoints(edge).targetId === port && leaves(edge)) result.add(edge);
      }
    }
    return [...result];
  };
  return order(group);
}

/** Creation order of hierarchy segments in ELK's CompoundGraphPreprocessor. */
const hierarchySegmentRank = new WeakMap<ElkEdge, number>();
const segmentOrderByScope = new WeakMap<ElkNode, ReadonlyMap<string, number>>();
const originalEdgeId = new WeakMap<ElkEdge, string>();

/**
 * Segments inside `group`, in creation order: the inner pass connects child
 * groups' exported ports first, then the outer pass leaves `group` itself.
 */
function elkSegmentOrder(
  group: ElkNode,
  scope: ElkNode,
  originals: ReadonlyMap<ElkEdge, { sourceId: string; targetId: string }>,
  ownBoundary: boolean,
): Map<string, number> {
  const order = new Map<string, number>();
  const add = (edge: ElkEdge) => {
    const id = originalEdgeId.get(edge) ?? String(edge.id);
    if (!order.has(id)) order.set(id, order.size);
  };
  for (const child of group.children ?? [])
    if (child.children?.length)
      for (const edge of elkBoundaryEdgeOrder(child, scope, originals)) add(edge);
  if (ownBoundary) for (const edge of elkBoundaryEdgeOrder(group, scope, originals)) add(edge);
  return order;
}

const isPostCompactionKey = (key: string) =>
  /(^|\.)compaction\.postCompaction\.strategy$/.test(key);
function usesPostCompaction(options: Readonly<Record<string, unknown>>, node: ElkNode): boolean {
  const active = (values: Readonly<Record<string, unknown>> | undefined) =>
    Object.entries(values ?? {}).some(
      ([key, value]) => isPostCompactionKey(key) && String(value) !== "NONE",
    );
  const visit = (current: ElkNode): boolean =>
    active(current.layoutOptions) ||
    active(current.properties as Record<string, unknown> | undefined) ||
    (current.children ?? []).some(visit);
  return active(options) || visit(node);
}

function disablePostCompaction<T extends ElkNode>(node: T): T {
  for (const values of [node.layoutOptions, node.properties as Record<string, unknown> | undefined])
    for (const key of Object.keys(values ?? {}))
      if (isPostCompactionKey(key)) (values as Record<string, unknown>)[key] = "NONE";
  for (const child of node.children ?? []) disablePostCompaction(child);
  return node;
}

/**
 * Alternative random seeds worth trying for a compound layout, unless the
 * graph chooses its hierarchical greedy switch explicitly.
 */
function crossingVariants(
  options: Readonly<Record<string, unknown>>,
  graph: ElkNode,
): Array<Record<string, string>> {
  const own = { ...options, ...graph.properties, ...graph.layoutOptions };
  const compound = (graph.children ?? []).some((child) => child.children?.length);
  if (
    !compound ||
    getOption(own, "hierarchyHandling") !== "INCLUDE_CHILDREN" ||
    getOption(own, "layered.crossingMinimization.greedySwitchHierarchical.type") !== undefined
  )
    return [];
  return [{ "elk.randomSeed": "2" }, { "elk.randomSeed": "3" }];
}

/** Whether the graph asks for more than ELK's default layered thoroughness (7). */
function thorough(options: Readonly<Record<string, unknown>>, graph: ElkNode): boolean {
  const own = { ...options, ...graph.properties, ...graph.layoutOptions };
  return Number(getOption(own, "layered.thoroughness") ?? 7) > 7;
}
