"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-medium transition-[background-color,border-color,color,box-shadow] duration-100 disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** High-contrast neutral: the one strong action on a screen. */
        primary: "border-fg bg-fg text-fg-inverse hover:bg-fg/90 hover:border-fg/90 shadow-sm",
        secondary:
          "border-border-strong bg-bg text-fg hover:bg-bg-muted hover:border-border-strong shadow-sm",
        ghost:
          "border-transparent bg-transparent text-fg-secondary hover:bg-bg-muted hover:text-fg",
        destructive:
          "border-critical/30 bg-bg text-critical hover:bg-critical-subtle hover:border-critical/50",
        link: "h-auto border-transparent bg-transparent px-0 text-accent hover:underline underline-offset-4",
      },
      size: {
        xs: "h-6 px-2 text-2xs [&_svg]:size-3",
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
        lg: "h-9 px-3.5 text-sm",
        icon: "size-8 p-0",
        "icon-sm": "size-7 p-0",
        "icon-xs": "size-6 p-0 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };
