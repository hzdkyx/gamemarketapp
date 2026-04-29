import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

export const Table = ({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>): JSX.Element => (
  <div className="overflow-hidden rounded-lg border border-line">
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  </div>
);

export const Th = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>): JSX.Element => (
  <th
    className={cn("bg-slate-950/60 px-4 py-3 text-xs font-semibold uppercase text-slate-400", className)}
    {...props}
  />
);

export const Td = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>): JSX.Element => (
  <td className={cn("border-t border-line px-4 py-3 text-slate-200", className)} {...props} />
);
