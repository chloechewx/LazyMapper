import * as React from "react";
import { cn } from "./utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[6px] border border-[#ccd5d4] bg-white px-3 pr-8 text-sm text-[#161616] outline-none focus:border-[#161616] focus:ring-2 focus:ring-[#b9e4dc] disabled:cursor-not-allowed disabled:bg-[#edf1f0]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

