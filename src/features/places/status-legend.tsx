import { Badge } from "@/components/ui/badge";

const RESEARCH_STATES = [
  ["Ready", "Identity research is complete."],
  ["Review", "Research found candidates that need a decision."],
  ["Visual access required", "The identity is only visible in Instagram media."],
  ["Unresolved", "Research has not identified a reliable place."]
] as const;

const MAP_STATES = [
  ["Google verified", "Google supplied a verified listing. Coordinates may still be required for mapping."],
  ["Map ready", "Approved coordinates are ready for mapping."],
  ["Address found", "An address exists, but approved coordinates do not."],
  ["No address", "No usable street address is available."]
] as const;

export function StatusLegend() {
  return (
    <details className="relative">
      <summary className="cursor-pointer select-none text-xs font-bold text-[#3f5f79] hover:text-[#161616] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161616]">State legend</summary>
      <div className="absolute right-0 z-30 mt-2 grid w-[min(420px,calc(100vw-2rem))] gap-4 rounded-[7px] border border-[#cfd7d6] bg-white p-4 shadow-xl sm:grid-cols-2">
        <LegendGroup title="Research" entries={RESEARCH_STATES} />
        <LegendGroup title="Map" entries={MAP_STATES} />
      </div>
    </details>
  );
}

function LegendGroup({ title, entries }: { title: string; entries: ReadonlyArray<readonly [string, string]> }) {
  return <section><h3 className="text-[11px] font-extrabold uppercase text-[#65706f]">{title}</h3><dl className="mt-2 space-y-2">{entries.map(([label, description]) => <div key={label}><dt><Badge tone="neutral">{label}</Badge></dt><dd className="mt-1 text-xs leading-4 text-[#65706f]">{description}</dd></div>)}</dl></section>;
}
