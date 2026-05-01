import type { HTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

export const LoadingSkeleton = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn("skeleton-line h-4", className)} aria-hidden="true" {...props} />
);
