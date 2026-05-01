import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

const buttonVariants = cva(
  "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow-sm motion-safe:transition-all motion-safe:duration-200 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-cyan to-sky-300 text-slate-950 shadow-glowCyan hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:brightness-95",
        secondary:
          "border border-line bg-panelSoft text-slate-100 shadow-insetPanel hover:-translate-y-0.5 hover:border-cyan/25 hover:bg-elevated hover:text-white active:translate-y-0",
        ghost:
          "text-slate-300 shadow-none hover:bg-slate-800/75 hover:text-white active:bg-slate-800",
        danger:
          "bg-danger text-white shadow-[0_16px_38px_rgba(255,77,94,0.16)] hover:-translate-y-0.5 hover:bg-danger/90 active:translate-y-0"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        icon: "h-9 w-9 px-0"
      }
    },
    defaultVariants: {
      variant: "secondary",
      size: "md"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = ({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps): JSX.Element => {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size, className }))} {...props} />;
};
