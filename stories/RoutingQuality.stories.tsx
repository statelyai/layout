import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoutingComparison, RoutingReviewScenario, curveComparisonFixtures } from "./RoutingReview";
import {
  getRoutingQualityFixture,
  routingQualityFixtures,
  routingStressFixtures,
  routingStrategyFixtures,
  routingCoordinationFixtures,
} from "./routing-quality-fixtures";

const meta = {
  title: "Routing/Quality",
  component: RoutingReviewScenario,
  parameters: { layout: "fullscreen" },
  args: { fixtureId: "multiple-obstacles" },
} satisfies Meta<typeof RoutingReviewScenario>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FullGallery: Story = {
  render: () => (
    <RoutingComparison
      title="Routing quality gallery"
      description="Nine original policy cases and nineteen stress and regression cases. Review complete geometry, terminal direction, labels, shared trunks, and reported conflicts."
      fixtures={routingQualityFixtures}
    />
  ),
};
export const CurveFamilyComparison: Story = {
  render: () => (
    <RoutingComparison
      title="Curve families / same obstacles"
      description="Identical graph, attachments, clearance, and strategy. Only the curve policy changes."
      fixtures={curveComparisonFixtures(getRoutingQualityFixture("multiple-obstacles"))}
    />
  ),
};
export const LabelModeComparison: Story = {
  render: () => (
    <RoutingComparison
      title="Label modes / same bounds"
      description="Follow, fixed, through, and gap on one graph."
      fixtures={routingStressFixtures.filter((fixture) => fixture.id.startsWith("label-"))}
    />
  ),
};
export const AttachmentComparison: Story = {
  render: () => (
    <RoutingComparison
      title="Automatic and fixed attachments"
      description="Same node positions and obstacle. The fixed variant references the visible named ports."
      fixtures={[
        getRoutingQualityFixture("automatic-ports"),
        getRoutingQualityFixture("fixed-ports"),
      ]}
    />
  ),
};
export const OriginalPolicyComparison: Story = {
  render: () => {
    const fixture = getRoutingQualityFixture("obstacles");
    return (
      <RoutingComparison
        title="Obstacle policy / original and current"
        description="Original fixture geometry and settings are preserved for direct review."
        fixtures={[
          {
            ...fixture,
            id: `${fixture.id}-before`,
            title: "Original settings",
            settings: fixture.before ?? {},
          },
          { ...fixture, title: "Current policy" },
        ]}
      />
    );
  },
};
export const LabelFollow: Story = { args: { fixtureId: "label-follow" } };
export const LabelFixed: Story = { args: { fixtureId: "label-fixed" } };
export const LabelThrough: Story = { args: { fixtureId: "label-through" } };
export const LabelGap: Story = { args: { fixtureId: "label-gap" } };
export const AutomaticAttachments: Story = { args: { fixtureId: "automatic-ports" } };
export const FixedPorts: Story = { args: { fixtureId: "fixed-ports" } };
export const OpposingFaces: Story = { args: { fixtureId: "opposing-faces" } };
export const SameFaceSelfLoops: Story = { args: { fixtureId: "same-face-loops" } };
export const TightCorridor: Story = { args: { fixtureId: "tight-corridor" } };
export const MultipleObstacles: Story = { args: { fixtureId: "multiple-obstacles" } };
export const ParallelBranches: Story = { args: { fixtureId: "parallel-branches" } };
export const SharedBundle: Story = { args: { fixtureId: "shared-bundle" } };
export const ReversedEdges: Story = { args: { fixtureId: "reversed-edges" } };
export const IncrementalMoves: Story = { args: { fixtureId: "incremental-moves" } };

export const HighCurvatureObstacle: Story = { args: { fixtureId: "high-curvature-obstacle" } };
export const RestrictedLabelSides: Story = { args: { fixtureId: "restricted-label-sides" } };
export const CatmullRomFixedPorts: Story = { args: { fixtureId: "catmull-fixed-ports" } };
export const DenseSameFaceAttachments: Story = { args: { fixtureId: "dense-same-face" } };
export const SelfLoopNearObstacle: Story = { args: { fixtureId: "loop-near-obstacle" } };

export const StrategyGallery: Story = {
  render: () => (
    <RoutingComparison
      title="All routing strategies"
      description="The original catalog graph and default settings across all twelve strategies."
      fixtures={routingStrategyFixtures}
    />
  ),
};
export const CoordinationComparison: Story = {
  render: () => (
    <RoutingComparison
      title="Crossing coordination"
      description="The original crossing graph at penalties 0 and 800."
      fixtures={routingCoordinationFixtures}
    />
  ),
};
export const StraightStrategy: Story = { args: { fixtureId: "strategy-straight" } };
export const BezierStrategy: Story = { args: { fixtureId: "strategy-bezier" } };
export const OrthogonalStrategy: Story = { args: { fixtureId: "strategy-orthogonal" } };
export const PolylineStrategy: Story = { args: { fixtureId: "strategy-polyline" } };
export const OctilinearStrategy: Story = { args: { fixtureId: "strategy-octilinear" } };
export const CurvedStrategy: Story = { args: { fixtureId: "strategy-curved" } };
export const OrganicStrategy: Story = { args: { fixtureId: "strategy-organic" } };
export const ParallelStrategy: Story = { args: { fixtureId: "strategy-parallel" } };
export const SelfLoopStrategy: Story = { args: { fixtureId: "strategy-self-loop" } };
export const FanStrategy: Story = { args: { fixtureId: "strategy-fan" } };
export const BusStrategy: Story = { args: { fixtureId: "strategy-bus" } };
export const BundleStrategy: Story = { args: { fixtureId: "strategy-bundle" } };
