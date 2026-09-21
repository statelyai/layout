import UpstreamELK from "elkjs/lib/elk-api";
import type {
  ELK as UpstreamELKInterface,
  ELKConstructorArguments as UpstreamConstructorArguments,
  ElkEdge as UpstreamEdge,
  ElkEdgeSection as UpstreamEdgeSection,
  ElkExtendedEdge as UpstreamExtendedEdge,
  ElkGraphElement as UpstreamGraphElement,
  ElkLabel as UpstreamLabel,
  ElkLayoutArguments as UpstreamLayoutArguments,
  ElkNode as UpstreamNode,
  ElkPoint as UpstreamPoint,
  ElkPort as UpstreamPort,
  ElkPrimitiveEdge as UpstreamPrimitiveEdge,
  ElkShape as UpstreamShape,
  LayoutOptions as UpstreamLayoutOptions,
} from "elkjs/lib/elk-api";
import NativeELK, {
  type ELK as NativeELKInterface,
  type ELKConstructorArguments as NativeConstructorArguments,
  type ElkEdge as NativeEdge,
  type ElkEdgeSection as NativeEdgeSection,
  type ElkExtendedEdge as NativeExtendedEdge,
  type ElkGraphElement as NativeGraphElement,
  type ElkLabel as NativeLabel,
  type ElkLayoutArguments as NativeLayoutArguments,
  type ElkNode as NativeNode,
  type ElkPoint as NativePoint,
  type ElkPort as NativePort,
  type ElkPrimitiveEdge as NativePrimitiveEdge,
  type ElkShape as NativeShape,
  type LayoutOptions as NativeLayoutOptions,
} from "../../src/elkjs";

type Assert<T extends true> = T;
type Same<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

type LayoutOptionsMatch = Assert<Same<NativeLayoutOptions, UpstreamLayoutOptions>>;
type PointMatch = Assert<Same<NativePoint, UpstreamPoint>>;
type GraphElementMatch = Assert<Same<NativeGraphElement, UpstreamGraphElement>>;
type ShapeMatch = Assert<Same<NativeShape, UpstreamShape>>;
type NodeMatch = Assert<Same<NativeNode, UpstreamNode>>;
type PortMatch = Assert<Same<NativePort, UpstreamPort>>;
type LabelMatch = Assert<Same<NativeLabel, UpstreamLabel>>;
type EdgeMatch = Assert<Same<NativeEdge, UpstreamEdge>>;
type PrimitiveEdgeMatch = Assert<Same<NativePrimitiveEdge, UpstreamPrimitiveEdge>>;
type ExtendedEdgeMatch = Assert<Same<NativeExtendedEdge, UpstreamExtendedEdge>>;
type EdgeSectionMatch = Assert<Same<NativeEdgeSection, UpstreamEdgeSection>>;
type LayoutArgumentsMatch = Assert<Same<NativeLayoutArguments, UpstreamLayoutArguments>>;
type ConstructorArgumentsMatch = Assert<
  Same<NativeConstructorArguments, UpstreamConstructorArguments>
>;
type InterfaceMatch = Assert<Same<NativeELKInterface, UpstreamELKInterface>>;

const nativeConstructor: typeof UpstreamELK = NativeELK;

export type ElkjsTypeCompatibility = [
  LayoutOptionsMatch,
  PointMatch,
  GraphElementMatch,
  ShapeMatch,
  NodeMatch,
  PortMatch,
  LabelMatch,
  EdgeMatch,
  PrimitiveEdgeMatch,
  ExtendedEdgeMatch,
  EdgeSectionMatch,
  LayoutArgumentsMatch,
  ConstructorArgumentsMatch,
  InterfaceMatch,
  typeof nativeConstructor,
];
