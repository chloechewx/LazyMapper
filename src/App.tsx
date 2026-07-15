import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { applyPlacePatch, buildCsv, buildKml, collectionNamesFromExport, isCoordinatePair, isMappable, mapState, normalizePlace, parseExport, replaceCollection, researchState } from "@/features/domain";
import { ExportView } from "@/features/export/export-view";
import { ImportView, type PendingImport } from "@/features/import/import-view";
import { MapView } from "@/features/map/map-view";
import { GoogleCandidateDialog } from "@/features/places/google-candidate-dialog";
import { PlacesView, type PlaceFilters, type PlaceSort } from "@/features/places/places-view";
import { runResearchPipeline } from "@/lib/research-pipeline.js";
import { clearPlaces, createKeyedOperationGuard, createWorkspaceOperationGuard, migrateStoredPlaces, removePlace, restorePlace, selectedPlaceAfterRemoval } from "@/lib/workspace-state.js";
import type { GeminiResult, GoogleCandidate, GroundedResult, Place, ResearchProgressEvent, ResearchSummary, ServiceHealth, StudioView, UsageSnapshot } from "@/types";

const STORAGE_KEY = "pinboard-atlas-v1";
const EMPTY_FILTERS: PlaceFilters = { search: "", collection: "", category: "", research: "", map: "" };

function loadStoredPlaces(): Place[] {
  return migrateStoredPlaces(localStorage, STORAGE_KEY, normalizePlace) as Place[];
}

function download(content: string, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "all-places";
}

async function apiResult<T>(response: Response, fallback: string): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || fallback) as Error & { code?: string; resetsAt?: string };
    error.code = result.code;
    error.resetsAt = result.resetsAt;
    throw error;
  }
  return result as T;
}

export default function App() {
  const [places, setPlacesState] = React.useState<Place[]>(loadStoredPlaces);
  const [view, setView] = React.useState<StudioView>(places.length ? "places" : "import");
  const [filters, setFilters] = React.useState<PlaceFilters>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<PlaceSort>({ key: "placeName", direction: "asc" });
  const [selectedId, setSelectedId] = React.useState<string | null>(places[0]?.id || null);
  const [usage, setUsage] = React.useState<UsageSnapshot | null>(null);
  const [health, setHealth] = React.useState<ServiceHealth>({ geminiConfigured: false, googlePlacesConfigured: false });
  const [usageOpen, setUsageOpen] = React.useState(false);
  const [pendingImport, setPendingImport] = React.useState<PendingImport | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);
  const [importError, setImportError] = React.useState("");
  const [importProgress, setImportProgress] = React.useState("");
  const [busyAction, setBusyAction] = React.useState("");
  const [candidatePlace, setCandidatePlace] = React.useState<Place | null>(null);
  const [candidates, setCandidates] = React.useState<GoogleCandidate[]>([]);
  const [candidateDialogOpen, setCandidateDialogOpen] = React.useState(false);
  const [exportCollection, setExportCollection] = React.useState("");
  const [exportCategory, setExportCategory] = React.useState("");
  const [toast, setToast] = React.useState<{ message: string; error: boolean } | null>(null);
  const [deletedPlace, setDeletedPlace] = React.useState<{ place: Place; index: number } | null>(null);
  const [fileInputResetKey, setFileInputResetKey] = React.useState(0);
  const undoTimerRef = React.useRef<number | null>(null);
  const workspaceOperationsRef = React.useRef(createWorkspaceOperationGuard());
  const lookupOperationsRef = React.useRef(createKeyedOperationGuard());

  const persistPlaces = React.useCallback((next: Place[] | ((current: Place[]) => Place[])) => {
    setPlacesState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      const normalized = value.map(normalizePlace);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    });
  }, []);

  const notify = React.useCallback((message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshUsage = React.useCallback(async () => {
    try {
      const [usageResponse, healthResponse] = await Promise.all([fetch("/api/usage", { cache: "no-store" }), fetch("/api/health", { cache: "no-store" })]);
      const [usageResult, healthResult] = await Promise.all([apiResult<UsageSnapshot>(usageResponse, "Usage protection is unavailable."), apiResult<ServiceHealth>(healthResponse, "Service status is unavailable.")]);
      setUsage(usageResult);
      setHealth(healthResult);
      return usageResult;
    } catch {
      setUsage(null);
      setHealth({ geminiConfigured: false, googlePlacesConfigured: false });
      return null;
    }
  }, []);

  React.useEffect(() => { void refreshUsage(); }, [refreshUsage]);
  React.useEffect(() => () => { if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current); }, []);

  const geminiEnabled = Boolean(health.geminiConfigured && usage?.gemini?.protectionConfigured && usage.gemini.requests.warning !== "stopped" && usage.gemini.tokens?.warning !== "stopped");
  const groundingEnabled = Boolean(geminiEnabled && usage?.geminiGrounding?.protectionConfigured && usage.geminiGrounding.requests.warning !== "stopped");
  const googleEnabled = Boolean(health.googlePlacesConfigured && usage?.googlePlaces?.protectionConfigured && usage.googlePlaces.requests.warning !== "stopped");

  const filteredPlaces = React.useMemo(() => {
    const originalIndex = new Map(places.map((place, index) => [place.id, index]));
    const search = filters.search.trim().toLowerCase();
    return places.filter((place) => {
      if (search && ![place.placeName, place.instagramHandle, place.city, place.address].some((value) => String(value || "").toLowerCase().includes(search))) return false;
      if (filters.collection && place.collectionName !== filters.collection) return false;
      if (filters.category && place.category !== filters.category) return false;
      if (filters.research && researchState(place) !== filters.research) return false;
      if (filters.map && mapState(place) !== filters.map) return false;
      return true;
    }).sort((left, right) => {
      const leftValue = sort.key === "research" ? researchState(left) : sort.key === "map" ? mapState(left) : String(left[sort.key] || "");
      const rightValue = sort.key === "research" ? researchState(right) : sort.key === "map" ? mapState(right) : String(right[sort.key] || "");
      const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      return (result || (originalIndex.get(left.id) || 0) - (originalIndex.get(right.id) || 0)) * (sort.direction === "asc" ? 1 : -1);
    });
  }, [places, filters, sort]);

  const mapPlaces = React.useMemo(() => filteredPlaces.map((place, index) => ({ ...place, _displayIndex: index + 1 })).filter(isMappable), [filteredPlaces]);

  function updatePlace(id: string, patch: Partial<Place>) {
    persistPlaces((current) => current.map((place) => place.id === id ? applyPlacePatch(place, patch) : place));
  }

  function deletePlace(id: string) {
    const removed = removePlace(places, id) as { places: Place[]; deleted: { place: Place; index: number } | null };
    if (!removed.deleted) return;
    lookupOperationsRef.current.invalidate(id);
    if (busyAction === `google:${id}`) setBusyAction("");
    persistPlaces(removed.places);
    setSelectedId(selectedPlaceAfterRemoval(removed.places, filteredPlaces.map((place) => place.id), selectedId, id));
    if (candidatePlace?.id === id) {
      setCandidatePlace(null);
      setCandidates([]);
      setCandidateDialogOpen(false);
    }
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    setDeletedPlace(removed.deleted);
    undoTimerRef.current = window.setTimeout(() => {
      setDeletedPlace(null);
      undoTimerRef.current = null;
    }, 10_000);
  }

  function undoDelete() {
    if (!deletedPlace) return;
    persistPlaces((current) => current.some((place) => place.id === deletedPlace.place.id) ? current : restorePlace(current, deletedPlace) as Place[]);
    setSelectedId(deletedPlace.place.id);
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setDeletedPlace(null);
  }

  function clearWorkspace() {
    workspaceOperationsRef.current.invalidate();
    lookupOperationsRef.current.invalidateAll();
    persistPlaces(clearPlaces(places) as Place[]);
    setSelectedId(null);
    setFilters(EMPTY_FILTERS);
    setSort({ key: "placeName", direction: "asc" });
    setPendingImport(null);
    setImportError("");
    setImportProgress("");
    setImportBusy(false);
    setBusyAction("");
    setCandidatePlace(null);
    setCandidates([]);
    setCandidateDialogOpen(false);
    setExportCollection("");
    setExportCategory("");
    setToast(null);
    setDeletedPlace(null);
    setFileInputResetKey((current) => current + 1);
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  }

  function setPlaceSort(key: PlaceSort["key"]) {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  async function handleFile(file: File) {
    const operation = workspaceOperationsRef.current.begin();
    setImportError("");
    try {
      const json = JSON.parse(await file.text());
      if (!workspaceOperationsRef.current.isCurrent(operation)) return;
      const collections = collectionNamesFromExport(json);
      setPendingImport({ fileName: file.name, json, collections, selectedCollection: collections[0] || "" });
    } catch {
      if (!workspaceOperationsRef.current.isCurrent(operation)) return;
      setPendingImport(null);
      setImportError("This file is not valid JSON. Choose the original Instagram export file.");
    }
  }

  async function extractCaptionBatch(batch: Place[], operation: number) {
    if (!workspaceOperationsRef.current.isCurrent(operation)) return [];
    const response = await fetch("/api/gemini/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posts: batch.map((place) => ({ sourceId: place.id, instagramHandle: place.instagramHandle, instagramUrl: place.instagramUrl, collectionName: place.collectionName, caption: place.caption?.slice(0, 2400), placeName: place.placeName })) }) });
    const result = await apiResult<{ results: GeminiResult[] }>(response, "Gemini caption extraction failed.");
    if (!workspaceOperationsRef.current.isCurrent(operation)) return [];
    return result.results || [];
  }

  async function searchPlacesForPipeline(place: Place, operation: number): Promise<GoogleCandidate[]> {
    if (!googleEnabled || !workspaceOperationsRef.current.isCurrent(operation)) return [];
    const textQuery = place.geminiSearchQuery || [place.placeName, place.address, place.city, place.country].filter(Boolean).join(", ");
    const response = await fetch("/api/google-places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textQuery, country: place.country, latitude: place.latitude, longitude: place.longitude }) });
    const result = await apiResult<{ places: GoogleCandidate[] }>(response, "Google Places search failed.");
    if (!workspaceOperationsRef.current.isCurrent(operation)) return [];
    return result.places || [];
  }

  async function groundPlaceForPipeline(place: Place, operation: number): Promise<GroundedResult> {
    if (!groundingEnabled || !workspaceOperationsRef.current.isCurrent(operation)) return { sourceId: place.id, places: [] };
    const response = await fetch("/api/gemini/ground", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place: { sourceId: place.id, instagramHandle: place.instagramHandle, placeName: place.placeName, caption: place.caption?.slice(0, 2400), city: place.city, country: place.country } }) });
    const result = await apiResult<{ result: GroundedResult }>(response, "Gemini grounded research failed.");
    if (!workspaceOperationsRef.current.isCurrent(operation)) return { sourceId: place.id, places: [] };
    return result.result;
  }

  async function importPendingCollection() {
    if (!pendingImport) return;
    const operation = workspaceOperationsRef.current.begin();
    const importSnapshot = pendingImport;
    setImportBusy(true);
    setImportError("");
    setImportProgress("Parsing the selected Instagram collection...");
    try {
      const imported = parseExport(importSnapshot.json, importSnapshot.fileName, importSnapshot.selectedCollection);
      if (!imported.length) throw new Error("No saved Instagram posts were found in this collection.");
      let enriched = imported;
      let researchFailures = 0;
      if (geminiEnabled) {
        const result = await runResearchPipeline(imported, {
          googlePlacesAvailable: googleEnabled,
          extractCaptions: (batch: Place[]) => extractCaptionBatch(batch, operation),
          searchPlaces: (place: Place) => searchPlacesForPipeline(place, operation),
          groundPlace: (place: Place) => groundPlaceForPipeline(place, operation)
        }, {
          captionBatchSize: 10,
          concurrency: 2,
          onProgress: (event: ResearchProgressEvent) => { if (workspaceOperationsRef.current.isCurrent(operation)) setImportProgress(event.message); }
        }) as { places: Place[]; summary: ResearchSummary };
        enriched = result.places;
        researchFailures = result.summary.failed;
      }
      if (!workspaceOperationsRef.current.isCurrent(operation)) return;
      const next = replaceCollection(places, enriched, importSnapshot.selectedCollection);
      persistPlaces(next);
      setPendingImport(null);
      setSelectedId(enriched[0]?.id || selectedId);
      setFilters({ ...EMPTY_FILTERS, collection: importSnapshot.selectedCollection });
      setView("places");
      if (researchFailures) notify(`${enriched.length} places imported; ${researchFailures} could not be fully researched and remain available for review.`, true);
      else notify(`${enriched.length} places imported from ${importSnapshot.selectedCollection || importSnapshot.fileName}.`);
    } catch (caught) {
      if (!workspaceOperationsRef.current.isCurrent(operation)) return;
      setImportError(caught instanceof Error ? caught.message : "The collection could not be imported.");
    } finally {
      if (workspaceOperationsRef.current.isCurrent(operation)) { setImportBusy(false); setImportProgress(""); }
      await refreshUsage();
    }
  }

  async function searchGoogle(place: Place) {
    if (!googleEnabled) return;
    const operation = lookupOperationsRef.current.begin(place.id);
    setBusyAction(`google:${place.id}`);
    try {
      const textQuery = place.geminiSearchQuery || [place.placeName, place.address, place.city, place.country].filter(Boolean).join(", ");
      const response = await fetch("/api/google-places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textQuery, country: place.country, latitude: place.latitude, longitude: place.longitude }) });
      const result = await apiResult<{ places: GoogleCandidate[] }>(response, "Google Places search failed.");
      if (!lookupOperationsRef.current.isCurrent(place.id, operation)) return;
      setCandidatePlace(place);
      setCandidates(result.places || []);
      setCandidateDialogOpen(true);
    } catch (caught) {
      if (!lookupOperationsRef.current.isCurrent(place.id, operation)) return;
      const error = caught as Error & { code?: string; resetsAt?: string };
      notify(error.code === "local_budget_exhausted" && error.resetsAt ? `${error.message} Resets ${new Date(error.resetsAt).toLocaleString()}.` : error.message, true);
    } finally { if (lookupOperationsRef.current.isCurrent(place.id, operation)) setBusyAction(""); await refreshUsage(); }
  }

  function chooseCandidate(candidate: GoogleCandidate) {
    if (!candidatePlace) return;
    updatePlace(candidatePlace.id, { placeName: candidate.name || candidatePlace.placeName, address: candidate.address, latitude: candidate.latitude, longitude: candidate.longitude, googlePlaceId: candidate.id, googleMapsUrl: candidate.googleMapsUrl, googleBusinessStatus: candidate.businessStatus, googleVerifiedAt: new Date().toISOString(), status: candidatePlace.status === "Rejected" || candidatePlace.status === "Not Mappable" ? candidatePlace.status : "Approved" });
    setCandidateDialogOpen(false);
    const hasMapCoordinates = isCoordinatePair(candidate);
    notify(hasMapCoordinates ? `${candidate.name} is Google verified and map ready.` : `${candidate.name} is Google verified; coordinates are still missing.`);
  }

  const selectedExport = places.filter((place) => place.status !== "Rejected" && (!exportCollection || place.collectionName === exportCollection) && (!exportCategory || place.category === exportCategory));
  function downloadCsv() { download(`\ufeff${buildCsv(selectedExport)}`, "text/csv;charset=utf-8", `pinboard-atlas-${slug([exportCollection || "all-collections", exportCategory || "all-categories"].join("-"))}.csv`); }
  function downloadKml() { const mapped = selectedExport.filter(isMappable); download(buildKml(mapped, exportCollection || "All collections", exportCategory || "All categories"), "application/vnd.google-earth.kml+xml;charset=utf-8", `pinboard-atlas-${slug([exportCollection || "all-collections", exportCategory || "all-categories"].join("-"))}.kml`); }

  return (
    <AppShell view={view} onViewChange={setView} usage={usage} usageOpen={usageOpen} onUsageOpenChange={setUsageOpen} onUsageRefresh={() => { void refreshUsage(); }} onUsageSaved={setUsage} placeCount={places.length}>
      {view === "import" ? <ImportView places={places} pending={pendingImport} fileInputResetKey={fileInputResetKey} geminiEnabled={geminiEnabled} busy={importBusy} error={importError} onFile={(file) => void handleFile(file)} onCollectionChange={(selectedCollection) => setPendingImport((current) => current ? { ...current, selectedCollection } : current)} onImport={() => void importPendingCollection()} onClearWorkspace={clearWorkspace} /> : null}
      {view === "places" ? <PlacesView places={places} filteredPlaces={filteredPlaces} filters={filters} sort={sort} selectedId={selectedId} googleEnabled={googleEnabled} busyAction={busyAction} onFiltersChange={setFilters} onSort={setPlaceSort} onSelect={setSelectedId} onChange={updatePlace} onGoogleSearch={(place) => void searchGoogle(place)} onDelete={deletePlace} /> : null}
      {view === "map" ? <MapView places={mapPlaces} selectedId={selectedId} onSelect={setSelectedId} /> : null}
      {view === "export" ? <ExportView places={places} collection={exportCollection} category={exportCategory} onCollectionChange={setExportCollection} onCategoryChange={setExportCategory} onCsv={downloadCsv} onKml={downloadKml} /> : null}
      <GoogleCandidateDialog place={candidatePlace} candidates={candidates} open={candidateDialogOpen} onOpenChange={setCandidateDialogOpen} onChoose={chooseCandidate} />
      {importBusy && importProgress ? <div className="fixed bottom-20 right-4 z-[900] max-w-sm rounded-[7px] border border-[#c5b1e4] bg-[#e9dff7] px-4 py-3 text-sm font-semibold text-[#4f3768] shadow-xl md:bottom-4" role="status" aria-live="polite">{importProgress}</div> : null}
      {deletedPlace ? <div className="fixed bottom-20 right-4 z-[900] flex max-w-sm items-center gap-3 rounded-[7px] border border-[#9bc9c0] bg-[#dff1ed] px-4 py-3 text-sm font-semibold text-[#21594f] shadow-xl md:bottom-4" role="status"><span>{deletedPlace.place.placeName || "Place"} deleted.</span><button type="button" className="rounded-[4px] px-1.5 py-1 font-extrabold underline underline-offset-2 hover:bg-[#cbe7e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21594f]" onClick={undoDelete}>Undo</button></div> : toast ? <div className={`fixed bottom-20 right-4 z-[900] max-w-sm rounded-[7px] border px-4 py-3 text-sm font-semibold shadow-xl md:bottom-4 ${toast.error ? "border-[#dfa8bd] bg-[#f4ccdc] text-[#6b3147]" : "border-[#9bc9c0] bg-[#dff1ed] text-[#21594f]"}`} role="status">{toast.message}</div> : null}
    </AppShell>
  );
}
