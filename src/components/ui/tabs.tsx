import { cn } from "./utils";

export function Tabs({ value, onValueChange, items, ariaLabel }: { value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }>; ariaLabel: string }) {
  return (
    <div className="inline-flex rounded-[7px] border border-[#ccd5d4] bg-[#e9efee] p-0.5" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={value === item.value} onClick={() => onValueChange(item.value)} className={cn("h-8 rounded-[5px] px-3 text-xs font-bold text-[#65706f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161616]", value === item.value && "bg-white text-[#161616] shadow-sm")}>{item.label}</button>
      ))}
    </div>
  );
}

