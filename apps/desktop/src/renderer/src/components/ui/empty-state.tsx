import type { ReactNode } from "react";
import { cn } from "@renderer/lib/utils";

interface EmptyStateProps {
  title: string;
  helper: string;
  icon?: ReactNode;
  className?: string;
}

export const EmptyState = ({ title, helper, icon, className }: EmptyStateProps): JSX.Element => (
  <div
    className={cn(
      "grid min-h-[220px] place-items-center rounded-lg border border-dashed border-line bg-panelSoft/70 p-6 text-center shadow-insetPanel",
      className,
    )}
  >
    <div>
      {icon && <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md border border-line bg-panel text-slate-500">{icon}</div>}
      <div className="font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-400">{helper}</div>
    </div>
  </div>
);
