import type { HTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <section
    className={cn("rounded-lg border border-line bg-panel shadow-premium", className)}
    {...props}
  />
);

export const CardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn("flex items-center justify-between gap-4 border-b border-line p-5", className)} {...props} />
);

export const CardTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): JSX.Element => (
  <h2 className={cn("text-sm font-semibold text-slate-100", className)} {...props} />
);

export const CardContent = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => <div className={cn("p-5", className)} {...props} />;
