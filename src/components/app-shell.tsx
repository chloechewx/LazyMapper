import { Database, Download, Gauge, Map, MapPinned, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/components/ui/utils";
import { UsageFlyout } from "@/features/usage/usage-flyout";
import type { StudioView, UsageSnapshot, UsageWarning } from "@/types";

const views = [
  { id: "import" as const, label: "Import", icon: Upload },
  { id: "places" as const, label: "Places", icon: Database },
  { id: "map" as const, label: "Map", icon: Map },
  { id: "export" as const, label: "Export", icon: Download },
];

function strongestWarning(usage: UsageSnapshot | null): UsageWarning {
  const rank: UsageWarning[] = ["unconfigured", "safe", "warning", "high", "critical", "stopped"];
  return [usage?.gemini?.requests.warning, usage?.gemini?.tokens?.warning, usage?.googlePlaces?.requests.warning].filter(Boolean).sort((a, b) => rank.indexOf(b as UsageWarning) - rank.indexOf(a as UsageWarning))[0] as UsageWarning || "unconfigured";
}

export function AppShell({ view, onViewChange, usage, usageOpen, onUsageOpenChange, onUsageRefresh, onUsageSaved, placeCount, children }: { view: StudioView; onViewChange: (view: StudioView) => void; usage: UsageSnapshot | null; usageOpen: boolean; onUsageOpenChange: (open: boolean) => void; onUsageRefresh: () => void; onUsageSaved: (usage: UsageSnapshot) => void; placeCount: number; children: React.ReactNode }) {
  const warning = strongestWarning(usage);
  const titles: Record<StudioView, string> = { import: "Import", places: "Places", map: "Map", export: "Export" };
  return (
    <div className="flex h-dvh min-h-[600px] overflow-hidden bg-[#edf2f1] text-[#161616]">
      <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-[#2d2d2d] bg-[#161616] py-3 md:flex">
        <Tooltip label="Pinboard Atlas"><button type="button" className="mb-5 flex size-10 items-center justify-center rounded-[7px] bg-[#b9e4dc] text-[#161616]" aria-label="Pinboard Atlas"><MapPinned className="size-5" /></button></Tooltip>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Studio views">{views.map(({ id, label, icon: Icon }) => <Tooltip key={id} label={label}><button type="button" aria-label={label} aria-current={view === id ? "page" : undefined} onClick={() => onViewChange(id)} className={cn("flex size-10 items-center justify-center rounded-[6px] text-[#aeb7b5] transition-colors hover:bg-[#2a2a2a] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9e4dc]", view === id && "bg-white text-[#161616]")}><Icon className="size-4" /></button></Tooltip>)}</nav>
        <Tooltip label="Usage settings"><button type="button" aria-label="Usage settings" onClick={() => onUsageOpenChange(true)} className="flex size-10 items-center justify-center rounded-[6px] text-[#aeb7b5] hover:bg-[#2a2a2a] hover:text-white"><Settings2 className="size-4" /></button></Tooltip>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-[#cbd4d2] bg-white px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[#161616] text-white md:hidden"><MapPinned className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-extrabold">{titles[view]}</p><p className="truncate text-[11px] font-semibold text-[#74807e]">Pinboard Atlas <span aria-hidden="true">/</span> {placeCount} places</p></div></div>
          <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => onViewChange("places")} className="hidden sm:inline-flex"><Database className="size-3.5" />Workspace</Button><Button variant="outline" size="sm" aria-expanded={usageOpen} onClick={() => onUsageOpenChange(!usageOpen)}><span className={cn("size-2 rounded-full", warning === "safe" ? "bg-[#5b9f92]" : warning === "warning" ? "bg-[#d1ae28]" : warning === "high" ? "bg-[#d58f35]" : "bg-[#b94868]")} /><Gauge className="size-3.5" /><span className="hidden sm:inline">Usage</span></Button></div>
          <UsageFlyout usage={usage} open={usageOpen} onOpenChange={onUsageOpenChange} onRefresh={onUsageRefresh} onSaved={onUsageSaved} />
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-[700] grid h-16 grid-cols-4 border-t border-[#2d2d2d] bg-[#161616] px-1 md:hidden" aria-label="Studio views">{views.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => onViewChange(id)} className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-[5px] text-[10px] font-bold text-[#aeb7b5]", view === id && "bg-[#2b2b2b] text-white")}><Icon className="size-4" /><span>{label}</span></button>)}</nav>
    </div>
  );
}

