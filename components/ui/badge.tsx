import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-border bg-surface-2 text-foreground",
      outline: "border-border text-muted",
      accent: "border-transparent bg-accent-soft text-accent",
      positive: "border-transparent bg-positive-soft text-positive",
      warning: "border-transparent bg-warning-soft text-warning",
      negative: "border-transparent bg-negative-soft text-negative",
      info: "border-transparent bg-accent-soft text-info",
      google: "border-transparent bg-google/10 text-google",
      meta: "border-transparent bg-meta/10 text-meta",
      linkedin: "border-transparent bg-linkedin/10 text-linkedin",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
