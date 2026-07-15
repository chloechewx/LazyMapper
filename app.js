const CATEGORIES = ["Food", "Cafe", "Bar", "Hotel", "Attraction", "Shopping", "Fashion", "Beauty", "Wellness", "Transport", "Event", "Inspiration", "Unknown"];
const STATUSES = ["Parsed", "Enriched", "Needs Review", "Address Ready", "Approved", "Rejected", "Not Mappable", "Visited", "Want to Visit"];
const EXPORT_COLUMNS = ["IG Link", "Google Maps", "Brand Name", "City", "Address"];
const STORAGE_KEY = "pinboard-atlas-v1";
const TARGET_COLLECTION = "Vietnam";
const LOCAL_COLLECTION_PATH = "your_instagram_activity/saved/saved_collections.json";
const LOCAL_ENRICHED_PATH = "data/vietnam_enriched.json";
const MAPPABLE_STATUSES = new Set(["Approved", "Visited", "Want to Visit"]);
const CITY_INDEX = [
  ["Singapore", "Singapore", 1.3521, 103.8198, ["singapore", "sg"]],
  ["Ho Chi Minh City", "Vietnam", 10.8231, 106.6297, ["ho chi minh city", "ho chi minh", "hochiminh", "hcmc", "hcm", "saigon"]],
  ["Taipei", "Taiwan", 25.033, 121.5654, ["taipei", "yongkang street", "yongkang st", "dongmen", "da'an district", "daan district"]],
  ["Tokyo", "Japan", 35.6762, 139.6503, ["tokyo", "shibuya", "ginza", "harajuku"]],
  ["Seoul", "South Korea", 37.5665, 126.978, ["seoul", "gangnam", "hongdae"]],
  ["Bangkok", "Thailand", 13.7563, 100.5018, ["bangkok", "thonglor", "sukhumvit"]],
  ["Bali", "Indonesia", -8.4095, 115.1889, ["bali", "canggu", "ubud", "seminyak"]],
  ["Kuala Lumpur", "Malaysia", 3.139, 101.6869, ["kuala lumpur", "klcc", "bukit bintang"]],
  ["Paris", "France", 48.8566, 2.3522, ["paris", "marais", "montmartre"]],
  ["London", "United Kingdom", 51.5072, -0.1276, ["london", "soho", "shoreditch"]],
  ["New York", "United States", 40.7128, -74.006, ["new york", "nyc", "brooklyn", "manhattan"]],
  ["Los Angeles", "United States", 34.0522, -118.2437, ["los angeles", "la", "silver lake"]],
  ["Sydney", "Australia", -33.8688, 151.2093, ["sydney", "surry hills"]],
  ["Melbourne", "Australia", -37.8136, 144.9631, ["melbourne", "fitzroy"]],
  ["Hong Kong", "Hong Kong", 22.3193, 114.1694, ["hong kong", "central", "kowloon"]],
  ["Dubai", "United Arab Emirates", 25.2048, 55.2708, ["dubai"]],
  ["Rome", "Italy", 41.9028, 12.4964, ["rome", "roma"]]
];
const CATEGORY_WORDS = {
  Food: ["restaurant", "dinner", "lunch", "eat", "food", "ramen", "pasta", "pizza", "brunch", "bakery"],
  Cafe: ["cafe", "coffee", "matcha", "espresso", "roastery", "patisserie"],
  Bar: ["bar", "cocktail", "wine", "speakeasy", "rooftop", "pub"],
  Hotel: ["hotel", "resort", "villa", "stay", "hostel", "ryokan"],
  Attraction: ["museum", "gallery", "temple", "beach", "park", "viewpoint", "attraction", "garden"],
  Shopping: ["shop", "store", "market", "boutique", "mall", "vintage"],
  Fashion: ["fashion", "clothing", "dress", "shoes", "jewelry", "streetwear", "designer"],
  Beauty: ["beauty", "makeup", "cosmetic", "salon", "nails", "skincare", "hair"],
  Wellness: ["spa", "massage", "yoga", "pilates", "wellness", "gym"],
  Transport: ["train", "airport", "ferry", "metro", "transport", "flight"],
  Event: ["festival", "concert", "event", "exhibition", "popup", "pop-up"],
  Inspiration: ["inspiration", "mood", "outfit", "recipe", "ideas", "wishlist"]
};

let state = loadState();
let currentView = "upload";
let reviewFilter = "pending";
let selectedPinId = null;
let toastTimer;
let leafletMap = null;
let leafletMarkers = null;
let lastMapSignature = "";
let googlePlacesAvailable = false;
let geminiAvailable = false;
let geminiModel = "gemini-3.1-flash-lite";
let googleBatchRunning = false;
let placeSearchContext = null;
let pendingImportFiles = [];
let mediaTargetId = "";
let mediaAnalysisRunningId = "";
let selectedPlaceId = state.items[0]?.id || null;
let placeSort = { key: "placeName", direction: "asc" };
let usageState = null;

const $ = (selector) => document.querySelector(selector);
const $ = (selector) => [...document.querySelectorAll(selector)];

function apiError(result, fallback) {
  const error = new Error(result?.error || fallback);
  error.code = result?.code || "";
  error.resetsAt = result?.resetsAt || "";
  return error;
}

function usageAllows(service) {
  const section = usageState?.[service];
  return Boolean(section?.protectionConfigured && section?.requests?.warning !== "stopped" && (service !== "gemini" || section?.tokens?.warning !== "stopped"));
}

function formatUsage(value) { return Number(value || 0).toLocaleString(); }

function strongestUsageWarning(snapshot) {
  const levels = ["unconfigured", "safe", "warning", "high", "critical", "stopped"];
  return [snapshot?.gemini?.requests?.warning, snapshot?.gemini?.tokens?.warning, snapshot?.googlePlaces?.requests?.warning]
    .filter(Boolean).sort((left, right) => levels.indexOf(right) - levels.indexOf(left))[0] || "unconfigured";
}

function renderUsage() {
  if (!$("#usagePanel")) return;
  const metrics = [
    ["#usageGeminiRequests", "#usageGeminiBar", usageState?.gemini?.requests],
    ["#usageGeminiTokens", "#usageTokenBar", usageState?.gemini?.tokens],
    ["#usagePlacesRequests", "#usagePlacesBar", usageState?.googlePlaces?.requests]
  ];
  metrics.forEach(([labelSelector, barSelector, metric]) => {
    $(labelSelector).textContent = metric ? `${formatUsage(metric.used)} / ${metric.cap ? formatUsage(metric.cap) : "-"}` : "Unavailable";
    const bar = $(barSelector);
    bar.style.width = `${metric?.percent || 0}%`;
    bar.dataset.warning = metric?.warning || "unconfigured";
  });
  const warning = strongestUsageWarning(usageState);
  $("#usageIndicator").className = warning;
  $("#usageStatusText").textContent = !usageState
    ? "Usage protection is unavailable. Outbound actions are disabled."
    : usageState.protectionConfigured
      ? warning === "stopped" ? "A local cap has been reached. Exports remain available." : "Local caps are active. Google dashboards remain authoritative."
      : "Protection is not configured. Set positive caps before using Gemini or Google Places.";
}

async function loadUsageSnapshot() {
  try {
    const response = await fetch("/api/usage", { cache: "no-store" });
    usageState = response.ok ? await response.json() : null;
  } catch { usageState = null; }
  renderUsage();
  renderGooglePlacesStatus();
  renderList();
  renderReview();
  return usageState;
}

function openUsagePanel() { $("#usagePanel").hidden = false; $("#usageButton").setAttribute("aria-expanded", "true"); }
function closeUsagePanel() { $("#usagePanel").hidden = true; $("#usageButton").setAttribute("aria-expanded", "false"); }

function openUsageSettings() {
  const settings = usageState?.settings || {};
  $("#geminiDailyRequestCap").value = settings.geminiDailyRequestCap || 20;
  $("#geminiDailyTokenCap").value = settings.geminiDailyTokenCap || 100000;
  $("#googlePlacesMonthlyRequestCap").value = settings.googlePlacesMonthlyRequestCap || 100;
  $("#usageSettingsError").textContent = "";
  const dialog = $("#usageSettingsDialog");
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
}

function closeUsageSettings() {
  const dialog = $("#usageSettingsDialog");
  if (dialog?.open && typeof dialog.close === "function") dialog.close(); else dialog?.removeAttribute("open");
}

async function saveUsageSettings(event) {
  event.preventDefault();
  const values = {
    geminiDailyRequestCap: Number($("#geminiDailyRequestCap").value),
    geminiDailyTokenCap: Number($("#geminiDailyTokenCap").value),
    googlePlacesMonthlyRequestCap: Number($("#googlePlacesMonthlyRequestCap").value)
  };
  $("#usageSettingsError").textContent = "";
  try {
    const response = await fetch("/api/usage/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(result, "Could not save usage settings");
    usageState = result;
    renderUsage(); renderGooglePlacesStatus(); renderList(); closeUsageSettings();
    notify("Local API protection caps saved.");
  } catch (error) { $("#usageSettingsError").textContent = error.message; }
}

function loadState() {
  try { const items=JSON.parse(localStorage.getItem(STORAGE_KEY))||[]; return { items:items.map(refreshCaptionDerivedItem), importedFiles:[] }; }
  catch { return { items: [], importedFiles: [] }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
function makeId() { return crypto.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function clean(value) {
  const text = (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
  if (!/[\u0080-\u009f]|ÃƒÆ’|Ãƒâ€š|ÃƒÂ¢|ÃƒÂ°/.test(text) || [...text].some(char => char.charCodeAt(0) > 255)) return text;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from([...text], char => char.charCodeAt(0))).trim();
  } catch {
    return text;
  }
}
function slug(value) { return clean(value).toLowerCase().replace(/\s+/g, "-"); }
function escapeHtml(value) { return clean(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function safeUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function instagramUrl(text) { return clean(text).match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/i)?.[0]?.replace(/[),.;]+$/, "") || ""; }
function displayName(handle) { return clean(handle).replace(/^@/, "").replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Untitled saved post"; }
function isUnidentifiedPlace(item) {
  if (!item || item.googlePlaceId || item.address) return false;
  if (item.geminiMediaAnalyzedAt && item.geminiMediaOutcome !== "none" && clean(item.placeName)) return false;
  const evidence = `${clean(item.matchReason)} ${clean(item.notes)}`;
  return Boolean(item.geminiRequiresMedia) || /only visible|hidden in (?:the )?(?:reel|carousel|post)|caption does not identify|exact place not identifiable|no usable venue name/i.test(evidence) || /^(?:saigon|hcmc|ho chi minh).*(?:post|reel|guide|spots?)$/i.test(clean(item.placeName));
}

function mapsUrl(item) {
  const verifiedUrl = safeUrl(item.googleMapsUrl);
  if (item.googlePlaceId && verifiedUrl) return verifiedUrl;
  if (isUnidentifiedPlace(item)) return "";
  const query = [item.placeName, item.address, item.city, item.country].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}
function notify(message, error = false) { const el = $("#toast"); el.textContent = message; el.className = `toast visible${error ? " error" : ""}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = "toast", 3500); }

function flattenObject(input, path = "", out = [], seen = new WeakSet()) {
  if (input == null || typeof input !== "object") return out;
  if (seen.has(input)) return out;
  seen.add(input);
  if (Array.isArray(input)) input.forEach((value, index) => flattenObject(value, `${path}[${index}]`, out, seen));
  else {
    const primitive = {};
    for (const [key, value] of Object.entries(input)) {
      if (value == null || ["string", "number", "boolean"].includes(typeof value)) primitive[key] = value;
    }
    if (Object.keys(primitive).length) out.push({ path, object: input, primitive });
    Object.entries(input).forEach(([key, value]) => { if (value && typeof value === "object") flattenObject(value, path ? `${path}.${key}` : key, out, seen); });
  }
  return out;
}

function normalizedRecord(record, fileName) {
  const p = record.primitive;
  const entries = Object.entries(p);
  const pick = (...needles) => clean(entries.find(([key]) => needles.some(n => key.toLowerCase().includes(n)))?.[1]);
  const stringMap = record.object.string_map_data || record.object.stringMapData || {};
  const mapValues = Object.entries(stringMap).reduce((acc, [key, value]) => { acc[key.toLowerCase()] = value?.value ?? value?.href ?? value; return acc; }, {});
  const allText = [...entries.map(([,v]) => clean(v)), ...Object.values(mapValues).map(clean)].join(" ");
  const url = safeUrl(p.href || p.url || p.link || mapValues.link || mapValues.href) || instagramUrl(allText);
  const title = clean(p.title || p.name || mapValues.title || mapValues.name);
  const caption = clean(p.caption || p.text || p.description || mapValues.caption || mapValues.description || title);
  let handle = clean(p.username || p.handle || p.owner_username || p.account_name || p.author || mapValues.username || mapValues.handle);
  if (!handle) handle = allText.match(/(?:^|\s)@([\w.]{2,30})/)?.[1] || url.match(/instagram\.com\/([^/?#]+)(?:\/?$|\?)/i)?.[1] || "";
  handle = handle.replace(/^@/, "");
  const collectionName = pick("collection", "folder", "board") || clean(mapValues.collection);
  const savedAt = pick("timestamp", "saved_at", "saved on", "date") || clean(mapValues["saved on"] || mapValues.timestamp);
  const mediaType = pick("media_type", "media type", "type");
  const relevant = url.includes("instagram.com") || handle || caption || collectionName;
  if (!relevant) return null;
  return { url, handle, title, caption, collectionName, savedAt, mediaType, sourcePath: record.path, sourceFile: fileName, raw: record.object };
}

function nestedLabelValue(input, wantedLabel) {
  const stack = Array.isArray(input) ? [...input] : [input];
  const wanted = wantedLabel.toLowerCase();
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== "object") continue;
    if (clean(node.label).toLowerCase() === wanted) return clean(node.value || node.href);
    if (Array.isArray(node.dict)) stack.unshift(...node.dict);
    else if (node.dict && typeof node.dict === "object") stack.unshift(node.dict);
  }
  return "";
}

function collectionEntriesFromExport(json) {
  if (!Array.isArray(json)) return [];
  return json.filter(entry => Array.isArray(entry?.label_values) && nestedLabelValue(entry.label_values, "Name"));
}

function collectionNamesFromExport(json) {
  return collectionEntriesFromExport(json).map(entry => nestedLabelValue(entry.label_values, "Name")).filter(Boolean);
}

function parseCollectionExport(json, fileName, collectionName = "") {
  const collections = collectionEntriesFromExport(json);
  if (!collections.length) return null;
  const selected = collectionName ? collections.filter(entry => nestedLabelValue(entry.label_values, "Name").toLowerCase() === collectionName.toLowerCase()) : collections;
  return selected.flatMap(collection => {
    const actualCollectionName = nestedLabelValue(collection.label_values, "Name");
    const mediaGroup = collection.label_values.find(value => clean(value.title).toLowerCase() === "media");
    const mediaEntries = Array.isArray(mediaGroup?.dict) ? mediaGroup.dict : [];
    return mediaEntries.map(entry => enrichRecord({
      url: nestedLabelValue(entry, "URL"),
      caption: nestedLabelValue(entry, "Caption"),
      title: nestedLabelValue(entry, "Title"),
      handle: nestedLabelValue(entry, "Username"),
      collectionName: actualCollectionName,
      savedAt: "",
      mediaType: "",
      sourceFile: fileName,
      sourcePath: `collection:${actualCollectionName}`,
      raw: entry
    })).filter(item => item.instagramUrl || item.instagramHandle || item.caption);
  });
}

function parseExport(json, fileName, collectionName = "") {
  const collectionRecords = parseCollectionExport(json, fileName, collectionName);
  if (collectionRecords !== null) return collectionRecords;
  const records = flattenObject(json).map(record => normalizedRecord(record, fileName)).filter(Boolean);
  const instagramRecords = records.filter(r => r.url.includes("instagram.com") || r.handle);
  const chosen = instagramRecords.length ? instagramRecords : records;
  const deduped = new Map();
  for (const record of chosen) {
    const key = [record.url, record.handle, record.caption.slice(0,80), record.savedAt, record.collectionName].join("|").toLowerCase();
    if (!deduped.has(key)) deduped.set(key, record);
  }
  return [...deduped.values()].map(enrichRecord);
}
function canonicalInstagramUrl(value) {
  const url=safeUrl(value);
  if (!url) return "";
  try {
    const parsed=new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return "";
    const path=parsed.pathname.replace(/\/+$/,"");
    return `instagram.com${path}`;
  } catch {
    return "";
  }
}

function mergeImportedWithResearch(imported, research) {
  const researchByUrl=new Map();
  research.forEach(item=>{
    const key=canonicalInstagramUrl(item.instagramUrl);
    if (!key) return;
    if (!researchByUrl.has(key)) researchByUrl.set(key,[]);
    researchByUrl.get(key).push(item);
  });
  return imported.flatMap(item=>{
    const matches=researchByUrl.get(canonicalInstagramUrl(item.instagramUrl));
    if (!matches?.length) return [item];
    return matches.map(match=>({
      ...match,
      id:makeId(),
      collectionName:item.collectionName||match.collectionName,
      instagramUrl:item.instagramUrl||match.instagramUrl
    }));
  });
}
function expandItemWithGemini(item, places) {
  if (!item || !Array.isArray(places) || !places.length) return item ? [item] : [];
  return places.map(place => {
    const address = clean(place.addressClue);
    const expanded = {
      ...item,
      id: makeId(),
      category: CATEGORIES.includes(place.category) ? place.category : "Unknown",
      status: "Needs Review",
      placeName: clean(place.brandName) || item.placeName,
      address,
      city: clean(place.city),
      country: clean(place.country),
      latitude: "",
      longitude: "",
      confidence: Math.max(Number(item.confidence) || 0, Math.min(1, Math.max(0, Number(place.confidence) || 0))),
      matchReason: `${clean(item.matchReason)}; Gemini extracted ${clean(place.brandName)}${place.evidence ? ` from: ${clean(place.evidence)}` : ""}`.replace(/^;\s*/, ""),
      googlePlaceId: "",
      googleBusinessStatus: "",
      googleVerifiedAt: "",
      googleMatchScore: "",
      googleMapsUrl: "",
      geminiSearchQuery: clean(place.searchQuery),
      geminiRequiresMedia: Boolean(place.requiresMedia),
      geminiExtractionVersion: 1
    };
    expanded.googleMapsUrl = mapsUrl(expanded);
    return expanded;
  });
}

function isGeminiEligible(item) {
  return item?.status === "Needs Review" && !item.googlePlaceId && Boolean(item.caption || item.instagramHandle || item.instagramUrl);
}

async function analyzeUnresolvedWithGemini(items) {
  if (!geminiAvailable) return items;
  const eligibleIds = new Set(items.filter(isGeminiEligible).map(item => item.id));
  if (!eligibleIds.size) return items;
  const resultsById = new Map();
  const queue = items.filter(item => eligibleIds.has(item.id));

  for (let start = 0; start < queue.length; start += 10) {
    const batch = queue.slice(start, start + 10);
    notify(`Gemini is analyzing ${Math.min(start + batch.length, queue.length)} of ${queue.length} unresolved posts...`);
    try {
      const response = await fetch("/api/gemini/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: batch.map(item => ({
          sourceId: item.id,
          instagramHandle: item.instagramHandle,
          instagramUrl: item.instagramUrl,
          collectionName: item.collectionName,
          caption: clean(item.caption).slice(0, 2400),
          placeName: item.placeName
        })) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Gemini analysis failed");
      (result.results || []).forEach(entry => resultsById.set(entry.sourceId, entry.places || []));
    } catch (error) {
      console.warn("Gemini import analysis skipped for one batch:", error.message);
    }
  }

  return items.flatMap(item => eligible…1102 tokens truncated…niMediaAnalyzedAt?"Analyze different media":"Add reel media"}</button>`
      : "";
    return `<article class="review-card" data-card-id="${item.id}">
    <div class="source-summary"><div class="source-title"><span class="review-index">${workspaceIndex}</span><div><span class="handle">${item.instagramHandle?"@"+escapeHtml(item.instagramHandle):"NO HANDLE"}</span><h3>${escapeHtml(item.placeName)}</h3></div></div><p>${escapeHtml(item.caption||"No caption was available in the export.")}</p>${item.instagramUrl?`<a href="${escapeHtml(safeUrl(item.instagramUrl))}" target="_blank" rel="noreferrer">Open Instagram source Ã¢â€ â€”</a>`:""}</div>
    <div class="edit-grid">
      ${field("Place name","placeName",item.placeName)}
      <label class="field"><span>Category</span><select data-edit="category" data-id="${item.id}">${optionMarkup(CATEGORIES,item.category)}</select></label>
      ${field("Address","address",item.address,"full")}${field("City","city",item.city)}${field("Country","country",item.country)}
      ${field("Latitude","latitude",item.latitude,"","number")}${field("Longitude","longitude",item.longitude,"","number")}
      ${field("Notes","notes",item.notes,"full","textarea")}
    </div>
    <div class="decision-panel">${item.googlePlaceId?`<div class="google-place-proof"><strong>Google verified</strong><span>${escapeHtml(item.googleBusinessStatus?.replaceAll("_"," ")||"LISTING MATCHED")}</span><code>${escapeHtml(item.googlePlaceId)}</code></div>`:""}<span class="badge ${slug(item.status)}">${escapeHtml(item.status)}</span><div class="review-reason"><strong>${escapeHtml(reason.label)}</strong><span>${escapeHtml(reason.detail)}</span></div><small>${escapeHtml(item.matchReason)} Ã‚Â· ${Math.round(item.confidence*100)}% confidence</small>
      ${mediaButton}
      ${isUnidentifiedPlace(item)?`<button class="button google" disabled title="No exact venue was identified">Exact place unknown</button>`:`<button class="button google" data-action="google-search" data-id="${item.id}">${item.googlePlaceId?"Recheck Google":"Find on Google"}</button>`}
      <button class="button primary" data-action="status" data-status="Approved" data-id="${item.id}">Approve for map</button>
      <button class="button locate" data-action="geocode" data-id="${item.id}">Find coordinates</button>
      <button class="button" data-action="status" data-status="Want to Visit" data-id="${item.id}">Want to visit</button>
      <button class="button" data-action="status" data-status="Visited" data-id="${item.id}">Mark visited</button>
      <button class="button subtle" data-action="status" data-status="Not Mappable" data-id="${item.id}">Inspiration only</button>
      <button class="button danger" data-action="status" data-status="Rejected" data-id="${item.id}">Reject</button>
    </div></article>`; }).join("");
  $("#reviewEmpty").classList.toggle("visible",!items.length);
}
function field(label,key,value,extra="",type="text") {
  const attrs=`data-edit="${key}" data-id="${this?.id||""}"`; // id is repaired below by renderReview delegation fallback
  if(type==="textarea") return `<label class="field ${extra}"><span>${label}</span><textarea data-edit="${key}">${escapeHtml(value)}</textarea></label>`;
  return `<label class="field ${extra}"><span>${label}</span><input type="${type}" step="any" data-edit="${key}" value="${escapeHtml(value)}" /></label>`;
}
function isMappable(item) { return MAPPABLE_STATUSES.has(item.status)&&isPlausibleLocation(item); }
function mapItems() { const c=$("#mapCategory").value, country=$("#mapCountry").value, city=$("#mapCity").value, status=$("#mapStatus").value; return state.items.filter(i=>isMappable(i)&&(!c||i.category===c)&&(!country||i.country===country)&&(!city||i.city===city)&&(!status||i.status===status)); }
function pinClass(category) { if(["Food","Cafe","Bar","Hotel"].includes(category)) return "food"; if(["Shopping","Fashion","Beauty","Wellness"].includes(category)) return "shop"; return "explore"; }
function pinPositions(items) {
  if (!items.length) return new Map();
  const latitudes=items.map(item=>Number(item.latitude)), longitudes=items.map(item=>Number(item.longitude));
  let minLat=Math.min(...latitudes), maxLat=Math.max(...latitudes), minLon=Math.min(...longitudes), maxLon=Math.max(...longitudes);
  const minimumSpan=.02;
  if (maxLat-minLat<minimumSpan) { const center=(minLat+maxLat)/2; minLat=center-minimumSpan/2; maxLat=center+minimumSpan/2; }
  if (maxLon-minLon<minimumSpan) { const center=(minLon+maxLon)/2; minLon=center-minimumSpan/2; maxLon=center+minimumSpan/2; }
  return new Map(items.map(item=>[item.id,{x:7+(Number(item.longitude)-minLon)/(maxLon-minLon)*86,y:7+(maxLat-Number(item.latitude))/(maxLat-minLat)*86}]));
}
function ensureLeafletMap() {
  if (leafletMap || !window.L) return;
  leafletMap=L.map("leafletMap",{zoomControl:true}).setView([15.8,108.2],6);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:20,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(leafletMap);
  leafletMarkers=L.layerGroup().addTo(leafletMap);
}
function markerColor(item) { return pinClass(item.category)==="food"?"#d95f46":pinClass(item.category)==="shop"?"#176c52":"#d5a514"; }
function renderMap() {
  if(currentView!=="map") return;
  ensureLeafletMap();
  const items=mapItems(); $("#mapEmpty").classList.toggle("visible",!items.length);
  if(!leafletMap||!leafletMarkers)return;
  leafletMarkers.clearLayers();
  const bounds=[];
  items.forEach((item,index)=>{
    const point=[Number(item.latitude),Number(item.longitude)];
    bounds.push(point);
    const marker=L.marker(point,{icon:L.divIcon({
      className:"numbered-map-marker-shell",
      html:`<span class="numbered-map-marker ${pinClass(item.category)} ${selectedPinId===item.id?"active":""}">${index+1}</span>`,
      iconSize:[30,30],
      iconAnchor:[15,15]
    })}).bindTooltip(`${index+1}. ${item.placeName}`,{direction:"top",offset:[0,-10]});
    marker.on("click",()=>{selectedPinId=item.id;renderInspector(item);renderMap();});
    marker.addTo(leafletMarkers);
  });
  const signature=items.map(item=>`${item.id}:${item.latitude}:${item.longitude}`).join("|");
  setTimeout(()=>leafletMap.invalidateSize(),0);
  if(items.length&&signature!==lastMapSignature){leafletMap.fitBounds(bounds,{padding:[34,34],maxZoom:15});lastMapSignature=signature;}
  const item=state.items.find(i=>i.id===selectedPinId); if(item) renderInspector(item); else if(!items.length) $("#mapInspector").innerHTML=`<p class="eyebrow">SELECTED PIN</p><h2>Choose a place</h2><p>Approved places with coordinates will appear on this map.</p>`;
}
function renderInspector(item) { $("#mapInspector").innerHTML=`<p class="eyebrow">${escapeHtml(item.category)}</p><h2>${escapeHtml(item.placeName)}</h2><p>${escapeHtml(item.notes||item.caption||"Saved from Instagram")}</p><dl><dt>Status</dt><dd><span class="badge ${slug(item.status)}">${escapeHtml(item.status)}</span></dd><dt>Location</dt><dd>${escapeHtml([item.address,item.city,item.country].filter(Boolean).join(", ")||"Coordinates only")}</dd><dt>Coordinates</dt><dd>${escapeHtml(item.latitude)}, ${escapeHtml(item.longitude)}</dd>${item.googlePlaceId?`<dt>Google listing</dt><dd>${escapeHtml(item.googleBusinessStatus?.replaceAll("_"," ")||"Verified")}<br><code>${escapeHtml(item.googlePlaceId)}</code></dd>`:""}<dt>Collection</dt><dd>${escapeHtml(item.collectionName||"Unsorted")}</dd></dl><div class="map-links">${item.instagramUrl?`<a class="button subtle" href="${escapeHtml(safeUrl(item.instagramUrl))}" target="_blank" rel="noreferrer">Open Instagram</a>`:""}<a class="button primary" href="${escapeHtml(item.googleMapsUrl||mapsUrl(item))}" target="_blank" rel="noreferrer">Open Google Maps</a></div>`; }
function selectedExportItems(mappedOnly = false) {
  const collection=$("#exportCollection").value, category=$("#exportCategory").value;
  return state.items.filter(item=>(!collection||item.collectionName===collection)&&(!category||item.category===category)&&(!mappedOnly||isMappable(item)));
}
function exportFileSuffix() { return slug([$("#exportCollection").value||"all-collections",$("#exportCategory").value||"all-categories"].join("-")); }
function renderExport() {
  const csvItems=selectedExportItems(false), kmlItems=selectedExportItems(true);
  $("#csvExportCount").textContent=`${csvItems.length} places`; $("#kmlExportCount").textContent=`${kmlItems.length} mapped places`;
  $("#approvedExportCount").textContent=`${kmlItems.length} rows`; $("#allExportCount").textContent=`${csvItems.length} rows`; $("#schemaList").innerHTML="";
}
function render() { renderSelects(); renderMetrics(); renderList(); renderReview(); renderMap(); renderExport(); renderGooglePlacesStatus(); }

function clearGoogleVerification(item) {
  item.googlePlaceId=""; item.googleBusinessStatus=""; item.googleVerifiedAt=""; item.googleMatchScore=""; item.googleMapsUrl="";
}

function updateItemFromInput(input) {
  const card=input.closest("[data-card-id]"); const item=state.items.find(i=>i.id===(input.dataset.id||card?.dataset.cardId)); if(!item)return;
  let value=input.value; if(["latitude","longitude"].includes(input.dataset.edit)&&value!=="") value=Number(value);
  const key=input.dataset.edit, changed=item[key]!==value;
  const addressChanged=["address","city","country"].includes(key)&&changed;
  const verificationChanged=["placeName","address","city","country","latitude","longitude"].includes(key)&&changed;
  item[key]=value;
  if(verificationChanged){clearGoogleVerification(item);if(MAPPABLE_STATUSES.has(item.status))item.status="Needs Review";}
  if(addressChanged){item.latitude="";item.longitude="";}
  item.googleMapsUrl=mapsUrl(item); saveState(); renderMetrics(); renderMap(); renderExport();
}
function setStatus(id,status) { const item=state.items.find(i=>i.id===id); if(!item)return; if(["Approved","Visited","Want to Visit"].includes(status)&&!isPlausibleLocation(item)) { item.status="Needs Review"; saveState(); render(); return notify("Add valid latitude and longitude before mapping this place.",true); } item.status=status; saveState(); render(); notify(`${item.placeName} marked ${status.toLowerCase()}.`); }
async function geocodeItem(id) { const index=state.items.findIndex(item=>item.id===id); if(index<0)return; const item=state.items[index]; if(!item.address)return notify("Add an address before finding coordinates.",true); notify(`Finding ${item.placeName} on the map...`); const located=await geocodeAddress(item,true); if(!isPlausibleLocation(located))return notify("No reliable coordinate match was found. Add the city and country, then try again.",true); state.items[index]=located; selectedPinId=located.id; saveState(); render(); notify(`${located.placeName} is now mapped.`); }
function isCoordinatePair(item) { const lat=Number(item.latitude),lon=Number(item.longitude); return item.latitude!==""&&item.longitude!==""&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180; }
function isPlausibleLocation(item) { if(!isCoordinatePair(item))return false; if(!/vietnam/i.test(item.country))return true; const lat=Number(item.latitude),lon=Number(item.longitude); return lat>=8&&lat<=24.5&&lon>=102&&lon<=110.5; }
function goToView(view) { currentView=view; $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view||(view==="review"&&b.dataset.view==="list"))); $$(".view").forEach(v=>v.classList.toggle("active",v.id===`${view}View`)); const labels={upload:["STEP 1","1. Add Instagram JSON"],list:["STEP 2","2. Review places"],review:["NEEDS ATTENTION","Resolve uncertain places"],map:["MAP","Mapped places"],export:["STEP 3","3. Download files"]}; $("#viewEyebrow").textContent=labels[view][0]; $("#viewTitle").textContent=labels[view][1]; if(view==="map") renderMap(); }
function csvCell(value) { return `"${clean(value).replace(/"/g,'""')}"`; }
function exportRow(item) {
  return {
    "IG Link":item.instagramUrl,
    "Google Maps":mapsUrl(item),
    "Brand Name":item.placeName,
    "City":item.city,
    "Address":item.address
  };
}
function buildCsv(items) {
  return [EXPORT_COLUMNS.map(csvCell).join(","),...items.map(item=>{
    const row=exportRow(item);
    return EXPORT_COLUMNS.map(column=>csvCell(row[column])).join(",");
  })].join("\r\n");
}
function downloadBlob(content,type,fileName) { const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement("a"); a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function downloadCsv() {
  const items=selectedExportItems(false);
  if(!items.length)return notify("There are no places in this category.",true);
  downloadBlob("\ufeff"+buildCsv(items),"text/csv;charset=utf-8",`pinboard-atlas-${exportFileSuffix()}.csv`);
  notify(`${items.length} places exported for Excel.`);
}

function xmlText(value) { return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;"); }
function htmlText(value) { return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function htmlAttribute(value) { return htmlText(value).replace(/"/g,"&quot;"); }
function compactLocation(item) {
  const address=clean(item.address);
  const parts=address?[address]:[];
  if (item.city&&!address.toLowerCase().includes(clean(item.city).toLowerCase())) parts.push(clean(item.city));
  const joined=parts.join(", ");
  if (item.country&&!joined.toLowerCase().includes(clean(item.country).toLowerCase())) parts.push(clean(item.country));
  return parts.join(", ");
}
function buildKml(items,collectionLabel="All collections",categoryLabel="All categories") {
  const placemarks=items.map(item=>{
    const googleMapsUrl=mapsUrl(item)||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`;
    const businessStatus=item.googlePlaceId?(item.googleBusinessStatus||"VERIFIED"):"NOT VERIFIED";
    const description=`Category: ${htmlText(item.category)}<br>Address: ${htmlText(compactLocation(item))}<br>Google business status: ${htmlText(businessStatus)}<br><a href="${htmlAttribute(googleMapsUrl)}">Open in Google Maps</a>`;
    return `    <Placemark><name>${xmlText(item.placeName)}</name><description><![CDATA[${description}]]></description><Point><coordinates>${item.longitude},${item.latitude},0</coordinates></Point></Placemark>`;
  }).join("\n");
  const documentName=xmlText([collectionLabel||"All collections",categoryLabel||"All categories"].join(" - "));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document><name>Pinboard Atlas - ${documentName}</name>\n${placemarks}\n  </Document>\n</kml>\n`;
}
function downloadKml() {
  const items=selectedExportItems(true);
  if(!items.length)return notify("There are no mapped coordinates to export.",true);
  const kml=buildKml(items,$("#exportCollection").value||"All collections",$("#exportCategory").value||"All categories");
  downloadBlob(kml,"application/vnd.google-earth.kml+xml;charset=utf-8",`pinboard-atlas-${exportFileSuffix()}-google-my-maps.kml`);
  notify(`${items.length} mapped places exported for Google My Maps.`);
}$("#chooseFileButton").addEventListener("click",()=>$("#fileInput").click()); $("#fileInput").addEventListener("change",e=>importFiles(e.target.files)); $("#mediaInput").addEventListener("change",e=>analyzeSelectedMedia(e.target.files?.[0])); $("#importSelectedCollectionButton").addEventListener("click",importPendingCollection);
$("#loadVietnamButton").addEventListener("click", importLocalVietnamCollection);
const drop=$("#dropZone"); ["dragenter","dragover"].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add("dragging")})); ["dragleave","drop"].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove("dragging")})); drop.addEventListener("drop",e=>importFiles(e.dataTransfer.files)); drop.addEventListener("keydown",e=>{if(["Enter"," "].includes(e.key))$("#fileInput").click()});
document.addEventListener("click",e=>{ const nav=e.target.closest("[data-view]"); if(nav)return goToView(nav.dataset.view); const action=e.target.closest("[data-action]"); if(!action)return; const {id}=action.dataset; if(action.dataset.action==="google-use"){const candidate=placeSearchContext?.candidates?.[Number(action.dataset.candidateIndex)];const item=state.items.find(entry=>entry.id===placeSearchContext?.itemId);if(applyGooglePlace(item,candidate))closeGooglePlaceDialog();return;} if(action.dataset.action==="review"){reviewFilter="all"; $$("[data-review-filter]").forEach(b=>b.classList.toggle("active",b.dataset.reviewFilter==="all")); renderReview();goToView("review");setTimeout(()=>document.querySelector(`[data-card-id="${id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),50);} if(action.dataset.action==="delete"){state.items=state.items.filter(i=>i.id!==id);saveState();render();notify("Item removed.");} if(action.dataset.action==="status")setStatus(id,action.dataset.status); if(action.dataset.action==="geocode")geocodeItem(id); if(action.dataset.action==="google-search")openGooglePlaceSearch(id); if(action.dataset.action==="media")openMediaPicker(id); if(action.dataset.action==="pin"){selectedPinId=id;renderMap();} });
document.addEventListener("change",e=>{if(e.target.matches("[data-edit]"))updateItemFromInput(e.target)}); document.addEventListener("blur",e=>{if(e.target.matches("[data-edit]"))updateItemFromInput(e.target)},true);
$("#listSearch").addEventListener("input",renderList); ["#listCollection","#listCategory","#listStatus"].forEach(id=>$(id).addEventListener("change",renderList)); ["#mapCategory","#mapCountry","#mapCity","#mapStatus"].forEach(id=>$(id).addEventListener("change",renderMap)); ["#exportCollection","#exportCategory"].forEach(id=>$(id).addEventListener("change",renderExport));
$("#reviewTabs").addEventListener("click",e=>{const b=e.target.closest("[data-review-filter]");if(!b)return;reviewFilter=b.dataset.reviewFilter;$$('[data-review-filter]').forEach(x=>x.classList.toggle("active",x===b));renderReview()});
$("#demoButton").addEventListener("click",()=>{const existing=new Set(state.items.map(i=>i.instagramHandle));const added=demoItems().filter(i=>!existing.has(i.instagramHandle));state.items.push(...added);saveState();render();notify(`${added.length} demo items loaded.`);goToView("list")});
$("#resetButton").addEventListener("click",()=>{if(!state.items.length||confirm("Clear every imported and edited item from this browser?")){state={items:[],importedFiles:[]};selectedPinId=null;saveState();render();goToView("upload");notify("Workspace cleared.")}});
$("#downloadCsvButton").addEventListener("click",downloadCsv); $("#downloadKmlButton").addEventListener("click",downloadKml); $("#downloadBackupButton").addEventListener("click",()=>{if(!state.items.length)return notify("There is nothing to back up yet.",true);downloadBlob(JSON.stringify(state.items,null,2),"application/json","pinboard-atlas-backup.json")});
$("#verifyAllGoogleButton").addEventListener("click",verifyAllWithGoogle);
$("#openNeedsReviewButton").addEventListener("click",()=>{reviewFilter="pending"; $$("[data-review-filter]").forEach(button=>button.classList.toggle("active",button.dataset.reviewFilter==="pending")); renderReview(); goToView("review");});
$("#backToPlacesButton").addEventListener("click",()=>goToView("list"));
$("#closeGooglePlaceDialog").addEventListener("click",closeGooglePlaceDialog);
$("#googlePlaceDialog").addEventListener("cancel",event=>{event.preventDefault();closeGooglePlaceDialog();});

window.PinboardAtlas=Object.freeze({parseExport,collectionNamesFromExport,mergeImportedWithResearch,mergeWorkspaceItems,expandItemWithGemini,isUnidentifiedPlace,shouldAutoVerifyGoogle,markAddressReady,buildCsv,buildKml});

saveState();
render();
checkGooglePlacesConnection();




