import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthoringPlayground } from "./AuthoringPlayground";
import { defaults } from "./authoring-fixtures";

const meta = {
  title: "Layout/Authoring",
  component: AuthoringPlayground,
  args: defaults,
  render: (args) => <AuthoringPlayground key={JSON.stringify(args)} {...args} />,
} satisfies Meta<typeof AuthoringPlayground>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EdgeOnlyRouting: Story = { args: { scenario: "routes" } };
export const IndependentConstraintGroups: Story = { args: { scenario: "groups" } };
export const ArrangeSelectedNodes: Story = { args: { scenario: "selection" } };
export const AffectedEdgeRepair: Story = { args: { scenario: "affected" } };
export const RequiredConstraintConflict: Story = { args: { scenario: "conflict" } };
export const ConstraintInducedOverlap: Story = { args: { scenario: "overlap" } };
export const NestedLeafFrames: Story = { args: { scenario: "nested" } };
export const UnsupportedIncremental: Story = { args: { scenario: "incremental" } };
