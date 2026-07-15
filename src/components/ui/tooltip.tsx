import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TooltipPrimitive.Provider delayDuration={350}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={7}
            className="z-[1000] rounded-[5px] bg-[#161616] px-2 py-1.5 text-[11px] font-bold text-white shadow-lg"
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-[#161616]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
