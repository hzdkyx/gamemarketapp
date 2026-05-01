import type { ReactNode } from "react";
import { Card, CardContent } from "./card";
import { LoadingSkeleton } from "./loading-skeleton";
import { cn } from "@renderer/lib/utils";

export type MetricTone = "success" | "warning" | "danger" | "purple" | "neutral" | "cyan";

interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
  tone?: MetricTone;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
  valueClassName?: string;
}

const toneClass: Record<MetricTone, { accent: string; icon: string; value: string }> = {
  success: {
    accent: "from-success/50 via-success/20 to-transparent",
    icon: "border-success/30 bg-success/10 text-emerald-300",
    value: "border-success/25 bg-success/10 text-emerald-300",
  },
  warning: {
    accent: "from-warning/50 via-warning/20 to-transparent",
    icon: "border-warning/30 bg-warning/10 text-amber-300",
    value: "border-warning/25 bg-warning/10 text-amber-300",
  },
  danger: {
    accent: "from-danger/50 via-danger/20 to-transparent",
    icon: "border-danger/30 bg-danger/10 text-red-300",
    value: "border-danger/25 bg-danger/10 text-red-300",
  },
  purple: {
    accent: "from-purple/50 via-purple/20 to-transparent",
    icon: "border-purple/30 bg-purple/10 text-violet-200",
    value: "border-purple/25 bg-purple/10 text-violet-200",
  },
  neutral: {
    accent: "from-slate-500/30 via-slate-500/10 to-transparent",
    icon: "border-slate-600/60 bg-slate-800/60 text-slate-200",
    value: "border-slate-600/60 bg-slate-800/60 text-slate-200",
  },
  cyan: {
    accent: "from-cyan/60 via-cyan/20 to-transparent",
    icon: "border-cyan/30 bg-cyan/10 text-cyan",
    value: "border-cyan/25 bg-cyan/10 text-cyan",
  },
};

export const MetricCard = ({
  label,
  value,
  helper,
  tone = "cyan",
  icon,
  loading = false,
  className,
  valueClassName,
}: MetricCardProps): JSX.Element => (
  <Card className={cn("group relative min-h-[128px] overflow-hidden", className)}>
    <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r", toneClass[tone].accent)} />
    <CardContent className="flex h-full flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </div>
        {icon && (
          <div className={cn("rounded-md border p-2 shadow-insetPanel", toneClass[tone].icon)}>
            {icon}
          </div>
        )}
      </div>
      <div>
        {loading ? (
          <LoadingSkeleton className="mt-5 h-8 w-28" />
        ) : (
          <div
            className={cn(
              "mt-5 inline-flex rounded-md border px-2.5 py-1 text-2xl font-bold leading-none",
              toneClass[tone].value,
              valueClassName,
            )}
          >
            {value}
          </div>
        )}
        <div className="mt-3 text-xs leading-5 text-slate-400">{helper}</div>
      </div>
    </CardContent>
  </Card>
);
