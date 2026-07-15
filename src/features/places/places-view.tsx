import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { attentionReason, mapState, researchState } from "@/features/domain";
import type { Place } from "@/types";
import { PlaceInspector } from "./place-inspector";
import { StatusLegend } from "./status-legend";

export interface PlaceFilters { search: string; collection: string; category: string; research: string; map: string }
export interface PlaceSort { key: "placeName" | "category" | "city" | "research" | "map"; direction: "asc" | "desc" }

function toneForResearch(state: string) {
  if (state === "Ready") return "mint" as const;
  if (state === "Review" || state === "Visual access required") return "yellow" as const;
  return "neutral" as const;
}

function toneForMap(state: string) {
  if (state === "Google verified" || state === "Map ready") return "mint" as const;
  if (state === "Address found") return "blue" as const;
  return "neutral" as const;
}

function SortButton({ label, column, sort, onSort }: { label: string; column: PlaceSort["key"]; sort: PlaceSort; onSort: (key: PlaceSort["key"]) => void }) {
  const Icon = sort.key !== column ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return <button type="button" className="inline-flex items-center gap-1 hover:text-[#161616] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161616]" onClick={() => onSort(column)}>{label}<Icon className="size-3" /></button>;
}

export function PlacesView({ places, filteredPlaces, filters, sort, selectedId, googleEnabled, busyAction, onFiltersChange, onSort, onSelect, onChange, onGoogleSearch, onDelete }: { places: Place[]; filteredPlaces: Place[]; filters: PlaceFilters; sort: PlaceSort; selectedId: string | null; googleEnabled: boolean; busyAction: string; onFiltersChange: (filters: PlaceFilters) => void; onSort: (key: PlaceSort["key"]) => void; onSelect: (id: string) => void; onChange: (id: string, patch: Partial<Place>) => void; onGoogleSearch: (place: Place) => void; onDelete: (id: string) => void }) {
  const [mobileSheetOpen, setMobileSheetOpen] = React.useState(false);
  const selected = places.find((place) => place.id === selectedId) || filteredPlaces[0] || null;
  const collections = [...new Set(places.map((place) => place.collectionName).filter(Boolean))].sort();
  const categories = [...new Set(places.map((place) => place.category).filter(Boolean))].sort();

  function selectPlace(id: string) {
    onSelect(id);
    if (window.matchMedia("(max-width: 1023px)").matches) setMobileSheetOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#d8dfde] bg-white px-4 py-3 lg:px-5">
        <div className="mb-2 flex justify-end"><StatusLegend /></div>
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(130px,170px))]">
          <label className="relative"><span className="sr-only">Search places</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#78817f]" /><Input className="pl-9" placeholder="Search name, handle, city..." value={filters.search} onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })} /></label>
          <Select aria-label="Filter by collection" value={filters.collection} onChange={(e) => onFiltersChange({ ...filters, collection: e.target.value })}><option value="">All collections</option>{collections.map((value) => <option key={value}>{value}</option>)}</Select>
          <Select aria-label="Filter by category" value={filters.category} onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</Select>
          <Select aria-label="Filter by research state" value={filters.research} onChange={(e) => onFiltersChange({ ...filters, research: e.target.value })}><option value="">All research states</option>{["Ready", "Review", "Visual access required", "Unresolved"].map((value) => <option key={value}>{value}</option>)}</Select>
          <Select aria-label="Filter by map state" value={filters.map} onChange={(e) => onFiltersChange({ ...filters, map: e.target.value })}><option value="">All map states</option>{["Google verified", "Map ready", "Address found", "No address"].map((value) => <option key={value}>{value}</option>)}</Select>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 bg-[#edf2f1] lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 overflow-auto bg-white" aria-label="Places table">
          <Table className="min-w-[1040px]">
            <TableHeader className="sticky top-0 z-10 bg-[#f2f5f4]"><TableRow><TableHead className="w-14 text-center">#</TableHead><TableHead><SortButton label="Place" column="placeName" sort={sort} onSort={onSort} /></TableHead><TableHead><SortButton label="Category" column="category" sort={sort} onSort={onSort} /></TableHead><TableHead><SortButton label="City" column="city" sort={sort} onSort={onSort} /></TableHead><TableHead><SortButton label="Research" column="research" sort={sort} onSort={onSort} /></TableHead><TableHead><SortButton label="Map" column="map" sort={sort} onSort={onSort} /></TableHead><TableHead className="w-32">Action</TableHead></TableRow></TableHeader>
            <TableBody>{filteredPlaces.map((place, index) => {
              const research = researchState(place);
              const map = mapState(place);
              return <TableRow key={place.id} tabIndex={0} aria-selected={place.id === selected?.id} onClick={() => selectPlace(place.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectPlace(place.id); }} className={place.id === selected?.id ? "cursor-pointer bg-[#e2f1ee] outline outline-1 -outline-offset-1 outline-[#8fc2b8]" : "cursor-pointer bg-white hover:bg-[#f5f8f7]"}><TableCell className="text-center"><span className="inline-flex size-7 items-center justify-center rounded-[5px] bg-[#161616] text-xs font-extrabold text-white">{index + 1}</span></TableCell><TableCell><div className="max-w-[290px]"><p className="truncate font-extrabold text-[#161616]">{place.placeName || "Untitled saved post"}</p><p className="mt-0.5 truncate text-xs text-[#697371]">{place.instagramHandle ? `@${place.instagramHandle.replace(/^@/, "")}` : "No Instagram handle"}</p></div></TableCell><TableCell><Badge tone="lavender">{place.category || "Unknown"}</Badge></TableCell><TableCell className="max-w-40 truncate text-[#475250]">{place.city || "-"}</TableCell><TableCell title={attentionReason(place)}><Badge tone={toneForResearch(research)}>{research}</Badge></TableCell><TableCell><Badge tone={toneForMap(map)}>{map}</Badge></TableCell><TableCell><div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); selectPlace(place.id); }}>Inspect</Button>{place.instagramUrl ? <a className="inline-flex size-8 items-center justify-center rounded-[5px] hover:bg-[#e9efee]" href={place.instagramUrl} target="_blank" rel="noreferrer" aria-label={`Open Instagram source for ${place.placeName}`} onClick={(event) => event.stopPropagation()}><ExternalLink className="size-3.5" /></a> : null}</div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
          {!filteredPlaces.length ? <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><p className="font-bold">No places match these filters.</p><p className="mt-1 text-sm text-[#65706f]">Adjust a filter or import another collection.</p></div> : null}
        </section>
        <aside className="hidden min-h-0 overflow-y-auto border-l border-[#cfd7d6] bg-white lg:block" aria-label="Place inspector"><PlaceInspector place={selected} googleEnabled={googleEnabled} busyAction={busyAction} onChange={onChange} onGoogleSearch={onGoogleSearch} onDelete={onDelete} /></aside>
      </div>
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen} title="Place inspector"><PlaceInspector place={selected} googleEnabled={googleEnabled} busyAction={busyAction} onChange={onChange} onGoogleSearch={onGoogleSearch} onDelete={onDelete} /></Sheet>
    </div>
  );
}
