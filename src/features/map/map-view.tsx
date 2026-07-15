import * as React from "react";
import { MapPin, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mapsUrl } from "@/features/domain";
import type { Place } from "@/types";

export function MapView({ places, selectedId, onSelect }: { places: Place[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const mapElement = React.useRef<HTMLDivElement>(null);
  const selected = places.find((place) => place.id === selectedId) || places[0] || null;

  React.useEffect(() => {
    if (!mapElement.current) return;
    let disposed = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((L) => {
      if (disposed || !mapElement.current) return;
      map = L.map(mapElement.current, { zoomControl: true, attributionControl: true }).setView([20, 105], 3);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      const bounds: Array<[number, number]> = [];
      places.forEach((place, index) => {
        const displayIndex = Number(place._displayIndex) || index + 1;
        const point: [number, number] = [Number(place.latitude), Number(place.longitude)];
        bounds.push(point);
        const marker = L.marker(point, { icon: L.divIcon({ className: "numbered-marker-shell", html: `<span class="numbered-marker ${place.id === selectedId ? "is-selected" : ""}">${displayIndex}</span>`, iconSize: [32, 38], iconAnchor: [16, 35] }) }).addTo(map as import("leaflet").Map);
        marker.bindTooltip(`${displayIndex}. ${place.placeName}`, { direction: "top", offset: [0, -24] });
        marker.on("click", () => onSelect(place.id));
      });
      if (bounds.length === 1) map.setView(bounds[0], 14);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
      window.setTimeout(() => map?.invalidateSize(), 0);
    });
    return () => { disposed = true; map?.remove(); };
  }, [places, selectedId, onSelect]);

  return (
    <div className="relative flex min-h-0 flex-1 bg-[#dfe7e5]">
      <div ref={mapElement} className="h-full min-h-[520px] w-full" aria-label="Map of filtered places" />
      {!places.length ? <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-4"><div className="rounded-[8px] border border-[#cbd4d2] bg-white p-5 text-center shadow-lg"><MapPin className="mx-auto size-5" /><p className="mt-2 font-extrabold">No mapped places in this filter</p><p className="mt-1 text-sm text-[#65706f]">Approve a place with coordinates to show it here.</p></div></div> : null}
      {selected ? <aside className="absolute bottom-4 left-4 right-4 z-[600] max-h-44 overflow-y-auto rounded-[8px] border border-[#bbc6c4] bg-white p-4 shadow-xl sm:right-auto sm:w-[360px]"><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[#161616] text-xs font-extrabold text-white">{Number(selected._displayIndex) || places.findIndex((place) => place.id === selected.id) + 1}</span><div className="min-w-0 flex-1"><h2 className="truncate font-extrabold">{selected.placeName}</h2><p className="mt-1 text-xs text-[#65706f]">{[selected.address, selected.city, selected.country].filter(Boolean).join(", ") || "Coordinates only"}</p><div className="mt-3 flex items-center gap-2"><Badge tone="lavender">{selected.category}</Badge>{mapsUrl(selected) ? <a className="inline-flex items-center gap-1 text-xs font-bold text-[#3f5f79]" href={mapsUrl(selected)} target="_blank" rel="noreferrer"><Navigation className="size-3" />Open map</a> : null}</div></div></div></aside> : null}
    </div>
  );
}

