// components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-800 text-zinc-50 shadow hover:bg-zinc-700",
        destructive:
          "bg-red-500 text-zinc-50 shadow-sm hover:bg-red-600",
        outline:
          "border border-zinc-300 bg-zinc-100 shadow-sm hover:bg-zinc-200",
        secondary:
          "bg-zinc-200 text-zinc-900 shadow-sm hover:bg-zinc-300",
        ghost: "hover:bg-zinc-100",
        link: "text-zinc-800 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-sm",
        sm: "h-7 rounded-sm px-3 text-xs",
        lg: "h-10 rounded-sm px-8",
        icon: "h-9 w-9 rounded-sm",
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };