import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

export const Table = ({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>): JSX.Element => (
  <div className="overflow-hidden rounded-lg border border-line/90 bg-panel/70 shadow-insetPanel">
    <div className="overflow-x-auto">
      <table className={cn("premium-table w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  </div>
);

export const Th = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>): JSX.Element => (
  <th
    className={cn(
      "bg-slate-950/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400",
      className
    )}
    {...props}
  />
);

export const Td = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>): JSX.Element => (
  <td className={cn("border-t border-line/70 px-4 py-3 text-slate-200", className)} {...props} />
);
