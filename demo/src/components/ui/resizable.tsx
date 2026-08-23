import { GripVerticalIcon } from "lucide-react";
import type { ComponentProps } from "react";
import * as ResizablePrimitive from "react-resizable-panels";

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={classNames("resizable-panel-group", className)}
      {...props}
    />
  );
}

const ResizablePanel = ResizablePrimitive.Panel;

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={classNames("resizable-handle", className)}
      {...props}
    >
      {withHandle ? (
        <span className="resizable-handle-grip" aria-hidden="true">
          <GripVerticalIcon />
        </span>
      ) : null}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
