import * as React from "react";
import { CheckCircle2, FileJson, FolderOpen, Loader2, ShieldAlert, Sparkles, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import type { Place } from "@/types";

export interface PendingImport { fileName: string; json: unknown; collections: string[]; selectedCollection: string }

export function ImportView({ places, pending, fileInputResetKey, geminiEnabled, busy, error, onFile, onCollectionChange, onImport, onClearWorkspace }: { places: Place[]; pending: PendingImport | null; fileInputResetKey: number; geminiEnabled: boolean; busy: boolean; error: string; onFile: (file: File) => void; onCollectionChange: (collection: string) => void; onImport: () => void; onClearWorkspace: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [clearOpen, setClearOpen] = React.useState(false);
  const collections = [...new Set(places.map((place) => place.collectionName).filter(Boolean))];
  function acceptFiles(files: FileList | null) { const file = files?.[0]; if (file) onFile(file); }
  return (
    <div className="flex-1 overflow-y-auto bg-[#edf2f1] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase text-[#65706f]">Import workspace</p><h1 className="mt-1 text-2xl font-extrabold text-[#161616]">Add an Instagram collection</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#65706f]">Choose the saved-post JSON, select one collection, and keep uncertain places available for review.</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone="mint">{places.length} places</Badge><Badge tone="lavender">{collections.length} {collections.length === 1 ? "collection" : "collections"}</Badge><Button size="sm" variant="danger" disabled={!places.length && !pending} onClick={() => setClearOpen(true)}><Trash2 className="size-3.5" />Clear workspace</Button></div></div>
        <section className="grid overflow-hidden rounded-[8px] border border-[#cbd4d2] bg-white shadow-sm lg:grid-cols-[1.35fr_0.65fr]">
          <div className="p-5 sm:p-7">
            <input key={fileInputResetKey} ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => acceptFiles(event.target.files)} />
            <button type="button" className={`flex min-h-64 w-full flex-col items-center justify-center rounded-[7px] border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161616] ${dragging ? "border-[#4b8e82] bg-[#e5f3f0]" : "border-[#b9c5c3] bg-[#f7f9f8] hover:border-[#6f8d88]"}`} onClick={() => inputRef.current?.click()} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFiles(e.dataTransfer.files); }}>
              <span className="flex size-12 items-center justify-center rounded-[7px] bg-[#b9e4dc]"><Upload className="size-5" /></span><strong className="mt-4 text-base">Drop saved_collections.json here</strong><span className="mt-2 text-sm text-[#65706f]">or choose a JSON file</span>
            </button>
            {pending ? <div className="mt-4 rounded-[7px] border border-[#cbd4d2] bg-white p-4"><div className="flex items-start gap-3"><FileJson className="mt-0.5 size-5 text-[#55706b]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{pending.fileName}</p><p className="mt-0.5 text-xs text-[#65706f]">{pending.collections.length ? `${pending.collections.length} collections found` : "A general saved-post export was found"}</p></div><CheckCircle2 className="size-5 text-[#4f8d82]" /></div>{pending.collections.length ? <label className="mt-4 block space-y-1.5 text-xs font-bold text-[#53605e]">Collection<Select value={pending.selectedCollection} onChange={(e) => onCollectionChange(e.target.value)}>{pending.collections.map((collection) => <option key={collection}>{collection}</option>)}</Select></label> : null}<Button className="mt-4 w-full" onClick={onImport} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}{busy ? "Importing and extracting..." : "Import selected collection"}</Button></div> : null}
            {error ? <p className="mt-4 rounded-[7px] border border-[#e2adc1] bg-[#f4ccdc] p-3 text-sm font-semibold text-[#6b3147]" role="alert">{error}</p> : null}
          </div>
          <aside className="border-t border-[#dbe2e1] bg-[#f5f8f7] p-5 lg:border-l lg:border-t-0 sm:p-7">
            <p className="text-xs font-extrabold uppercase text-[#65706f]">Service readiness</p>
            <div className="mt-4 space-y-3"><div className="flex gap-3 rounded-[7px] border border-[#a9d4cc] bg-[#dff1ed] p-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#37786d]" /><div><p className="text-sm font-extrabold">Local parsing</p><p className="mt-1 text-xs leading-5 text-[#53605e]">Ready. Existing browser data is preserved until you import a replacement collection.</p></div></div><div className={`flex gap-3 rounded-[7px] border p-3 ${geminiEnabled ? "border-[#c5b1e4] bg-[#e9dff7]" : "border-[#e4c459] bg-[#fff3c7]"}`}>{geminiEnabled ? <Sparkles className="mt-0.5 size-4 shrink-0 text-[#634780]" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#755d05]" />}<div><p className="text-sm font-extrabold">Gemini caption extraction</p><p className="mt-1 text-xs leading-5 text-[#53605e]">{geminiEnabled ? "Ready. Caption candidates are extracted automatically after import." : "Disabled until the API and positive local caps are configured."}</p></div></div></div>
            <div className="mt-5 border-t border-[#dbe2e1] pt-5"><p className="text-xs font-bold text-[#53605e]">Accepted source</p><p className="mt-2 text-xs leading-5 text-[#65706f]">Instagram JSON exports containing saved collections or saved posts. The selected collection replaces only its earlier rows.</p></div>
          </aside>
        </section>
        <Dialog open={clearOpen} onOpenChange={setClearOpen} title="Clear workspace?" description={`Clear ${places.length} records and ${collections.length} collections from this browser workspace?`}>
          <div className="p-5"><p className="text-sm leading-6 text-[#53605e]">This removes the current local records, import selection, filters, and pending review dialogs. Source files are not changed, and you can restore records by importing them again.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setClearOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => { setClearOpen(false); onClearWorkspace(); }}><Trash2 className="size-4" />Clear workspace</Button></div></div>
        </Dialog>
      </div>
    </div>
  );
}
