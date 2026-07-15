import * as React from "react";
import { cn } from "./utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[6px] border border-[#ccd5d4] bg-white px-3 text-sm text-[#161616] outline-none placeholder:text-[#87908f] focus:border-[#161616] focus:ring-2 focus:ring-[#b9e4dc] disabled:cursor-not-allowed disabled:bg-[#edf1f0] disabled:text-[#78807f]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

