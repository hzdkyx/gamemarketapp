import type { HTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "cyan" | "purple";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-slate-600/70 bg-slate-800/80 text-slate-200",
  success: "border-success/30 bg-success/10 text-emerald-300",
  warning: "border-warning/30 bg-warning/10 text-amber-300",
  danger: "border-danger/30 bg-danger/10 text-red-300",
  cyan: "border-cyan/30 bg-cyan/10 text-cyan-200",
  purple: "border-purple/30 bg-purple/10 text-violet-200"
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = ({ className, tone = "neutral", ...props }: BadgeProps): JSX.Element => (
  <span
    className={cn(
      "inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold",
      toneClass[tone],
      className
    )}
    {...props}
  />
);
