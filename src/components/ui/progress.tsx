import { cn } from "./utils";

export function Progress({ value = 0, warning = "safe", className }: { value?: number; warning?: string; className?: string }) {
  const color = warning === "stopped" || warning === "critical"
    ? "bg-[#b94868]"
    : warning === "high"
      ? "bg-[#d58f35]"
      : warning === "warning"
        ? "bg-[#d1ae28]"
        : "bg-[#5b9f92]";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#dce3e2]", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, value))}>
      <div className={cn("h-full transition-[width] duration-200", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

