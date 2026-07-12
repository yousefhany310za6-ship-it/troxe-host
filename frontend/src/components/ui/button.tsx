import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-glow-brand hover:shadow-glow-brand-lg hover:brightness-110 active:brightness-95",
        secondary:
          "glass-card text-foreground hover:bg-white/[0.06] hover:border-white/10",
        destructive:
          "bg-destructive/90 text-destructive-foreground hover:bg-destructive shadow-glow-danger",
        ghost:
          "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        outline:
          "border border-white/10 bg-transparent hover:bg-white/[0.04] hover:border-white/15 text-foreground",
        glow: "bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 text-white shadow-glow-brand-lg hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]",
      },
      size: {
        sm: "h-9 px-3.5 rounded-md text-xs",
        default: "h-10 px-5 py-2",
        lg: "h-12 px-8 rounded-xl text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
