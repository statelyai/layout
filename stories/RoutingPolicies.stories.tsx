import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoutingReviewScenario } from "./RoutingReview";

const meta = {
  title: "Routing/Policies",
  component: RoutingReviewScenario,
  parameters: { layout: "fullscreen" },
  args: { fixtureId: "midpoint" },
} satisfies Meta<typeof RoutingReviewScenario>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { playground: true } };
export const LabelFollowsCurve: Story = { args: { fixtureId: "midpoint" } };
export const IndependentEndpointTangents: Story = { args: { fixtureId: "tangents" } };
export const PerpendicularLabelAttachments: Story = { args: { fixtureId: "label-tangents" } };
export const CurveObstacleClearance: Story = { args: { fixtureId: "obstacles" } };
export const CatmullRomWaypoints: Story = { args: { fixtureId: "catmull-rom" } };
export const RoundedOrthogonalCorridors: Story = { args: { fixtureId: "rounded" } };
export const FinalGeometryCrossings: Story = { args: { fixtureId: "crossings" } };
export const MonotonicFlowDirection: Story = { args: { fixtureId: "monotonic" } };
export const SharedTrunksAndBranches: Story = { args: { fixtureId: "bundle" } };
