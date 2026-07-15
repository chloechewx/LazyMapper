import * as React from "react";
import { cn } from "./utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger";
type Size = "default" | "sm" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  default: "border-[#161616] bg-[#161616] text-white hover:bg-black",
  secondary: "border-[#a7d3cb] bg-[#b9e4dc] text-[#161616] hover:bg-[#a9d9d0]",
  outline: "border-[#ccd5d4] bg-white text-[#161616] hover:bg-[#f2f6f5]",
  ghost: "border-transparent bg-transparent text-[#4d5957] hover:bg-[#e9efee] hover:text-[#161616]",
  danger: "border-[#e7b7c9] bg-[#f4ccdc] text-[#4d182b] hover:bg-[#efbdd0]",
};

const sizes: Record<Size, string> = {
  default: "h-10 px-3.5 text-sm",
  sm: "h-8 px-2.5 text-xs",
  icon: "size-9 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161616] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

