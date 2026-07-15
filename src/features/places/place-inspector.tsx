import * as React from "react";
import { Check, ExternalLink, MapPin, Puzzle, Search, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { attentionReason, mapState, mapsUrl, placeNeedsAttention, researchState } from "@/features/domain";
import type { Place } from "@/types";

const CATEGORIES = ["Food", "Cafe", "Bar", "Hotel", "Attraction", "Shopping", "Fashion", "Beauty", "Wellness", "Transport", "Event", "Inspiration", "Unknown"];
const STATUSES = ["Needs Review", "Address Ready", "Approved", "Want to Visit", "Visited", "Not Mappable", "Rejected"];

function researchTone(state: string) {
  if (state === "Ready") return "mint" as const;
  if (state === "Review" || state === "Visual access required") return "yellow" as const;
  return "neutral" as const;
}

function mapTone(state: string) {
  if (state === "Google verified" || state === "Map ready") return "mint" as const;
  if (state === "Address found") return "blue" as const;
  return "neutral" as const;
}

export function PlaceInspector({ place, googleEnabled, busyAction, onChange, onGoogleSearch, onDelete }: { place: Place | null; googleEnabled: boolean; busyAction: string; onChange: (id: string, patch: Partial<Place>) => void; onGoogleSearch: (place: Place) => void; onDelete: (id: string) => void }) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [extensionOpen, setExtensionOpen] = React.useState(false);
  if (!place) return <div className="flex h-full min-h-72 items-center justify-center p-8 text-center text-sm text-[#77817f]">Select a place to inspect its source and verification details.</div>;
  const research = researchState(place);
  const map = mapState(place);
  const needsAttention = placeNeedsAttention(place);
  const link = mapsUrl(place);
  return (
    <>
    <div className="min-w-0">
      <div className="border-b border-[#dce2e1] bg-[#f7f9f8] p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-bold uppercase text-[#65706f]">Focused place</p><h2 className="mt-1 truncate text-lg font-extrabold">{place.placeName || "Untitled saved post"}</h2></div><Badge tone="lavender">{place.collectionName || "Unsorted"}</Badge></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase text-[#65706f]">Research</span><Badge tone={researchTone(research)}>{research}</Badge><span className="ml-1 text-[10px] font-bold uppercase text-[#65706f]">Map</span><Badge tone={mapTone(map)}>{map}</Badge></div>
      </div>
      <div className="space-y-5 p-4">
        <section className="space-y-2"><p className="text-[11px] font-bold uppercase text-[#65706f]">Source</p><p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#3f4847]">{place.caption || "No caption was available in this export."}</p><div className="flex flex-wrap gap-2">{place.instagramUrl ? <a className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-xs font-bold text-[#3f5f79] hover:bg-[#e4f0f5]" href={place.instagramUrl} target="_blank" rel="noreferrer">Instagram <ExternalLink className="size-3" /></a> : null}{research === "Visual access required" ? <Button size="sm" variant="outline" onClick={() => setExtensionOpen(true)}><Puzzle className="size-3.5" />Process with Instagram extension</Button> : null}</div></section>
        <section className={`rounded-[7px] border p-3 ${needsAttention ? "border-[#e9ca62] bg-[#fff7d9]" : "border-[#b9d8d2] bg-[#edf8f6]"}`}><div className="flex gap-2"><Sparkles className={`mt-0.5 size-4 shrink-0 ${needsAttention ? "text-[#816400]" : "text-[#27665b]"}`} /><div><p className={`text-xs font-extrabold ${needsAttention ? "text-[#5f4b00]" : "text-[#21594f]"}`}>{needsAttention ? "Attention needed" : "State reason"}</p><p className={`mt-1 text-xs leading-5 ${needsAttention ? "text-[#705c12]" : "text-[#27665b]"}`}>{attentionReason(place)}</p></div></div></section>
        <section className="grid grid-cols-2 gap-3">
          <label className="col-span-2 space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Place name<Input value={place.placeName} onChange={(e) => onChange(place.id, { placeName: e.target.value })} /></label>
          <label className="space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Category<Select value={place.category} onChange={(e) => onChange(place.id, { category: e.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</Select></label>
          <label className="space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Travel status<Select value={place.status} onChange={(e) => onChange(place.id, { status: e.target.value })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</Select></label>
          <label className="col-span-2 space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Address<Input value={place.address} onChange={(e) => onChange(place.id, { address: e.target.value, latitude: "", longitude: "", googlePlaceId: "", googleMapsUrl: "" })} /></label>
          <label className="space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">City<Input value={place.city} onChange={(e) => onChange(place.id, { city: e.target.value, googlePlaceId: "" })} /></label>
          <label className="space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Country<Input value={place.country} onChange={(e) => onChange(place.id, { country: e.target.value, googlePlaceId: "" })} /></label>
          <label className="space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Latitude<Input type="number" value={place.latitude} onChange={(e) => onChange(place.id, { latitude: e.target.value, googlePlaceId: "" })} /></label>
          <label className="space-y-1.5 text-[11px] font-bold uppercase text-[#65706f]">Longitude<Input type="number" value={place.longitude} onChange={(e) => onChange(place.id, { longitude: e.target.value, googlePlaceId: "" })} /></label>
        </section>
        <section className="space-y-2 border-t border-[#e0e5e4] pt-4"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase text-[#65706f]">Google listing</p>{place.googlePlaceId ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[#27665b]"><Check className="size-3.5" />Verified</span> : null}</div><p className="text-sm text-[#475250]">{place.googleBusinessStatus?.replaceAll("_", " ") || "No official listing selected"}</p>{place.googlePlaceId ? <code className="block break-all rounded-[5px] bg-[#edf1f0] p-2 text-xs text-[#53605e]">{place.googlePlaceId}</code> : null}<div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!googleEnabled || busyAction === `google:${place.id}`} onClick={() => onGoogleSearch(place)} title={googleEnabled ? "Search Google Places" : "Configure Google Places and local caps first"}><Search className="size-3.5" />{busyAction === `google:${place.id}` ? "Searching..." : place.googlePlaceId ? "Recheck Google" : "Find on Google"}</Button>{link ? <a className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#ccd5d4] bg-white px-2.5 text-xs font-bold text-[#161616] hover:bg-[#f2f6f5]" href={link} target="_blank" rel="noreferrer"><MapPin className="size-3.5" />Open map</a> : null}</div></section>
        <section className="border-t border-[#e0e5e4] pt-4"><p className="text-[11px] font-bold uppercase text-[#65706f]">Evidence</p><p className="mt-2 text-xs leading-5 text-[#65706f]">{place.matchReason || "No extraction evidence was recorded."}</p><p className="mt-2 text-xs font-bold text-[#3f4847]">{Math.round((Number(place.confidence) || 0) * 100)}% confidence</p></section>
        <section className="border-t border-[#e0e5e4] pt-4"><Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="size-3.5" />Delete place</Button></section>
      </div>
    </div>
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${place.placeName || "this place"}?`} description="This removes only this record from the local workspace.">
      <div className="p-5"><p className="text-sm leading-6 text-[#53605e]">You can undo this deletion for 10 seconds. Re-importing the source collection can also restore the record.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => { setDeleteOpen(false); onDelete(place.id); }}><Trash2 className="size-4" />Delete place</Button></div></div>
    </Dialog>
    <Dialog open={extensionOpen} onOpenChange={setExtensionOpen} title="Extension package not installed" description="Visual recovery is optional.">
      <div className="p-5"><p className="text-sm leading-6 text-[#53605e]">The Instagram extension will be added in a later package. This place can remain unresolved without blocking CSV or KML exports.</p><p className="mt-3 text-sm leading-6 text-[#53605e]">Pinboard Atlas will use an existing browser session only after you start a visual-recovery batch. It will not ask for account credentials.</p><div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => setExtensionOpen(false)}>Close</Button></div></div>
    </Dialog>
    </>
  );
}
