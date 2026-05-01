import type { HTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "cyan" | "purple";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-slate-600/60 bg-slate-800/70 text-slate-200",
  success: "border-success/35 bg-success/10 text-emerald-300 shadow-[0_0_18px_rgba(37,211,102,0.06)]",
  warning: "border-warning/35 bg-warning/10 text-amber-300 shadow-[0_0_18px_rgba(246,183,60,0.06)]",
  danger: "border-danger/35 bg-danger/10 text-red-300 shadow-[0_0_18px_rgba(255,77,94,0.07)]",
  cyan: "border-cyan/35 bg-cyan/10 text-cyan-200 shadow-[0_0_18px_rgba(39,215,242,0.06)]",
  purple: "border-purple/35 bg-purple/10 text-violet-200"
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = ({ className, tone = "neutral", ...props }: BadgeProps): JSX.Element => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold leading-none",
      toneClass[tone],
      className
    )}
    {...props}
  />
);
