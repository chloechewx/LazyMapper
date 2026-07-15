import { Download, FileDown, FileSpreadsheet, MapPinned } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { isMappable } from "@/features/domain";
import type { Place } from "@/types";

export function ExportView({ places, collection, category, onCollectionChange, onCategoryChange, onCsv, onKml }: { places: Place[]; collection: string; category: string; onCollectionChange: (value: string) => void; onCategoryChange: (value: string) => void; onCsv: () => void; onKml: () => void }) {
  const collections = [...new Set(places.map((place) => place.collectionName).filter(Boolean))].sort();
  const categories = [...new Set(places.map((place) => place.category).filter(Boolean))].sort();
  const selected = places.filter((place) => place.status !== "Rejected" && (!collection || place.collectionName === collection) && (!category || place.category === category));
  const mapped = selected.filter(isMappable);
  return (
    <div className="flex-1 overflow-y-auto bg-[#edf2f1] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl"><div className="mb-6"><p className="text-xs font-extrabold uppercase text-[#65706f]">Export workspace</p><h1 className="mt-1 text-2xl font-extrabold">Take the reviewed list with you</h1><p className="mt-2 text-sm leading-6 text-[#65706f]">Exports stay available when Gemini or Google Places is offline or stopped.</p></div>
        <section className="overflow-hidden rounded-[8px] border border-[#cbd4d2] bg-white shadow-sm">
          <div className="grid gap-3 border-b border-[#dbe2e1] bg-[#f6f8f7] p-4 sm:grid-cols-2 sm:p-5"><label className="space-y-1.5 text-xs font-bold text-[#53605e]">Collection<Select value={collection} onChange={(e) => onCollectionChange(e.target.value)}><option value="">All collections</option>{collections.map((value) => <option key={value}>{value}</option>)}</Select></label><label className="space-y-1.5 text-xs font-bold text-[#53605e]">Category<Select value={category} onChange={(e) => onCategoryChange(e.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</Select></label></div>
          <div className="grid lg:grid-cols-2">
            <article className="p-5 sm:p-7 lg:border-r lg:border-[#dbe2e1]"><span className="flex size-10 items-center justify-center rounded-[7px] bg-[#b9e4dc]"><FileSpreadsheet className="size-5" /></span><div className="mt-4 flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Spreadsheet CSV</h2><Badge tone="mint">{selected.length} rows</Badge></div><p className="mt-2 text-sm leading-6 text-[#65706f]">Every filtered place except rejected rows. Unknown addresses remain blank and unverified listings use a Maps search link.</p><div className="mt-4 rounded-[7px] border border-[#d5dddb] bg-[#f7f9f8] p-3"><p className="text-[11px] font-extrabold uppercase text-[#65706f]">Exact columns</p><code className="mt-2 block break-words text-xs leading-5 text-[#3f4847]">IG Link, Google Maps, Brand Name, City, Address</code></div><Button className="mt-5" onClick={onCsv} disabled={!selected.length}><Download className="size-4" />Download CSV</Button></article>
            <article className="border-t border-[#dbe2e1] p-5 sm:p-7 lg:border-t-0"><span className="flex size-10 items-center justify-center rounded-[7px] bg-[#b8dded]"><MapPinned className="size-5" /></span><div className="mt-4 flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Google My Maps KML</h2><Badge tone="blue">{mapped.length} pins</Badge></div><p className="mt-2 text-sm leading-6 text-[#65706f]">Only filtered map-ready rows with usable coordinates. Google verification is preferred but not required.</p><div className="mt-4 rounded-[7px] border border-[#d5dddb] bg-[#f7f9f8] p-3"><p className="text-[11px] font-extrabold uppercase text-[#65706f]">Placemark details</p><p className="mt-2 text-xs leading-5 text-[#3f4847]">Category, address, Google business status, and a clickable Maps link.</p></div><Button className="mt-5" onClick={onKml} disabled={!mapped.length}><FileDown className="size-4" />Download KML</Button></article>
          </div>
        </section>
      </div>
    </div>
  );
}
