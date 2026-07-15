export const CATEGORIES = ["Food", "Cafe", "Bar", "Hotel", "Attraction", "Shopping", "Fashion", "Beauty", "Wellness", "Transport", "Event", "Inspiration", "Unknown"];
export const STATUSES = ["Parsed", "Enriched", "Needs Review", "Address Ready", "Approved", "Rejected", "Not Mappable", "Visited", "Want to Visit"];
export const MAPPABLE_STATUSES = new Set(["Approved", "Visited", "Want to Visit"]);

const EXPORT_COLUMNS = ["IG Link", "Google Maps", "Brand Name", "City", "Address"];
const CITY_INDEX = [
  ["Singapore", "Singapore", ["singapore", "sg"]],
  ["Ho Chi Minh City", "Vietnam", ["ho chi minh city", "ho chi minh", "hochiminh", "hcmc", "hcm", "saigon"]],
  ["Taipei", "Taiwan", ["taipei", "yongkang street", "yongkang st", "dongmen", "da'an district", "daan district"]],
  ["Tokyo", "Japan", ["tokyo", "shibuya", "ginza", "harajuku"]],
  ["Seoul", "South Korea", ["seoul", "gangnam", "hongdae"]],
  ["Bangkok", "Thailand", ["bangkok", "thonglor", "sukhumvit"]],
  ["Bali", "Indonesia", ["bali", "canggu", "ubud", "seminyak"]],
  ["Kuala Lumpur", "Malaysia", ["kuala lumpur", "klcc", "bukit bintang"]],
  ["Paris", "France", ["paris", "marais", "montmartre"]],
  ["London", "United Kingdom", ["london", "soho", "shoreditch"]],
  ["New York", "United States", ["new york", "nyc", "brooklyn", "manhattan"]],
  ["Los Angeles", "United States", ["los angeles", "la", "silver lake"]],
  ["Sydney", "Australia", ["sydney", "surry hills"]],
  ["Melbourne", "Australia", ["melbourne", "fitzroy"]],
  ["Hong Kong", "Hong Kong", ["hong kong", "central", "kowloon"]],
  ["Dubai", "United Arab Emirates", ["dubai"]],
  ["Rome", "Italy", ["rome", "roma"]]
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

export function clean(value) {
  const text = (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
  const mayBeMojibake = /[\u0080-\u009f]|\u00c3|\u00c2|\u00e2/.test(text);
  if (!mayBeMojibake || [...text].some(character => character.charCodeAt(0) > 255)) return text;
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(Uint8Array.from([...text], character => character.charCodeAt(0)))
      .trim();
  } catch {
    return text;
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function instagramUrl(text) {
  return clean(text).match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/i)?.[0]?.replace(/[),.;]+$/, "") || "";
}

function displayName(handle) {
  return clean(handle)
    .replace(/^@/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase()) || "Untitled saved post";
}

export function isUnidentifiedPlace(item) {
  if (!item || item.googlePlaceId || clean(item.address)) return false;
  if (item.geminiMediaAnalyzedAt && item.geminiMediaOutcome !== "none" && clean(item.placeName)) return false;
  const evidence = `${clean(item.matchReason)} ${clean(item.notes)}`;
  return Boolean(item.geminiRequiresMedia)
    || /only visible|hidden in (?:the )?(?:reel|carousel|post)|caption does not identify|exact place not identifiable|no usable venue name/i.test(evidence)
    || /^(?:saigon|hcmc|ho chi minh).*(?:post|reel|guide|spots?)$/i.test(clean(item.placeName));
}

export function mapsUrl(item = {}) {
  const verifiedUrl = safeUrl(item.googleMapsUrl);
  if (item.googlePlaceId && verifiedUrl) return verifiedUrl;
  if (!isMappable(item)) return "";
  const query = [item.placeName, item.address, item.city, item.country].map(clean).filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function flattenObject(input, path = "", out = [], seen = new WeakSet()) {
  if (input == null || typeof input !== "object" || seen.has(input)) return out;
  seen.add(input);
  if (Array.isArray(input)) {
    input.forEach((value, index) => flattenObject(value, `${path}[${index}]`, out, seen));
  } else {
    const primitive = {};
    for (const [key, value] of Object.entries(input)) {
      if (value == null || ["string", "number", "boolean"].includes(typeof value)) primitive[key] = value;
    }
    if (Object.keys(primitive).length) out.push({ path, object: input, primitive });
    Object.entries(input).forEach(([key, value]) => {
      if (value && typeof value === "object") flattenObject(value, path ? `${path}.${key}` : key, out, seen);
    });
  }
  return out;
}

function normalizedRecord(record, fileName) {
  const primitive = record.primitive;
  const entries = Object.entries(primitive);
  const pick = (...needles) => clean(entries.find(([key]) => needles.some(needle => key.toLowerCase().includes(needle)))?.[1]);
  const stringMap = record.object.string_map_data || record.object.stringMapData || {};
  const mapValues = Object.entries(stringMap).reduce((values, [key, value]) => {
    values[key.toLowerCase()] = value?.value ?? value?.href ?? value;
    return values;
  }, {});
  const allText = [...entries.map(([, value]) => clean(value)), ...Object.values(mapValues).map(clean)].join(" ");
  const url = safeUrl(primitive.href || primitive.url || primitive.link || mapValues.link || mapValues.href) || instagramUrl(allText);
  const title = clean(primitive.title || primitive.name || mapValues.title || mapValues.name);
  const caption = clean(primitive.caption || primitive.text || primitive.description || mapValues.caption || mapValues.description || title);
  let handle = clean(primitive.username || primitive.handle || primitive.owner_username || primitive.account_name || primitive.author || mapValues.username || mapValues.handle);
  if (!handle) handle = allText.match(/(?:^|\s)@([\w.]{2,30})/)?.[1] || url.match(/instagram\.com\/([^/?#]+)(?:\/?$|\?)/i)?.[1] || "";
  handle = handle.replace(/^@/, "");
  const collectionName = pick("collection", "folder", "board") || clean(mapValues.collection);
  const savedAt = pick("timestamp", "saved_at", "saved on", "date") || clean(mapValues["saved on"] || mapValues.timestamp);
  const mediaType = pick("media_type", "media type", "type");
  if (!(url.includes("instagram.com") || handle || caption || collectionName)) return null;
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

export function collectionNamesFromExport(json) {
  return collectionEntriesFromExport(json)
    .map(entry => nestedLabelValue(entry.label_values, "Name"))
    .filter(Boolean);
}

function parseCollectionExport(json, fileName, collectionName) {
  const collections = collectionEntriesFromExport(json);
  if (!collections.length) return null;
  const selected = collectionName
    ? collections.filter(entry => nestedLabelValue(entry.label_values, "Name").toLowerCase() === clean(collectionName).toLowerCase())
    : collections;
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

export function parseExport(json, fileName, collectionName = "") {
  const collectionRecords = parseCollectionExport(json, fileName, collectionName);
  if (collectionRecords !== null) return collectionRecords;
  const records = flattenObject(json).map(record => normalizedRecord(record, fileName)).filter(Boolean);
  const instagramRecords = records.filter(record => record.url.includes("instagram.com") || record.handle);
  const chosen = instagramRecords.length ? instagramRecords : records;
  const deduped = new Map();
  for (const record of chosen) {
    const key = [record.url, record.handle, record.caption.slice(0, 80), record.savedAt, record.collectionName].join("|").toLowerCase();
    if (!deduped.has(key)) deduped.set(key, record);
  }
  return [...deduped.values()].map(enrichRecord);
}

function canonicalInstagramUrl(value) {
  const url = safeUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `instagram.com${path}`;
  } catch {
    return "";
  }
}

export function mergeImportedWithResearch(imported = [], research = []) {
  const researchByUrl = new Map();
  research.forEach(item => {
    const key = canonicalInstagramUrl(item.instagramUrl);
    if (!key) return;
    if (!researchByUrl.has(key)) researchByUrl.set(key, []);
    researchByUrl.get(key).push(item);
  });
  return imported.flatMap(item => {
    const matches = researchByUrl.get(canonicalInstagramUrl(item.instagramUrl));
    if (!matches?.length) return [item];
    return matches.map(match => ({
      ...match,
      id: makeId(),
      collectionName: item.collectionName || match.collectionName,
      instagramUrl: item.instagramUrl || match.instagramUrl
    }));
  });
}

function workspaceItemKey(item) {
  return [item.instagramUrl, item.instagramHandle, item.caption, item.collectionName, item.placeName, item.address]
    .map(clean)
    .join("|")
    .toLowerCase();
}

export function mergeWorkspaceItems(existing = [], imported = [], replaceCollections = []) {
  const replacements = new Set(replaceCollections.map(name => clean(name).toLowerCase()).filter(Boolean));
  const retained = existing.filter(item => !replacements.has(clean(item.collectionName).toLowerCase()));
  const keys = new Set(retained.map(workspaceItemKey));
  const unique = imported.filter(item => {
    const key = workspaceItemKey(item);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  return [...retained, ...unique];
}

function inferCategory(text) {
  let best = ["Unknown", 0];
  for (const [category, words] of Object.entries(CATEGORY_WORDS)) {
    const score = words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    if (score > best[1]) best = [category, score];
  }
  return best;
}

function inferCity(text) {
  return CITY_INDEX.find(([, , aliases]) => aliases.some(alias => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  }));
}

function captionLines(caption) {
  return clean(caption).split(/\r?\n/).map(line => clean(line)).filter(Boolean);
}

function isAddressLine(line) {
  const hasNumber = /(?:\u{1F4CD}|\bno\.?\s*\d+|\blane\s*\d+|\b\d{1,5}\s+[\p{L}])/iu.test(line);
  const hasStreetPart = /(?:street|\bst\.?\b|road|\brd\.?\b|lane|district|avenue|\bave\.?\b|boulevard|\bblvd\.?\b|\u0111\u01b0\u1eddng)/iu.test(line);
  return hasNumber && hasStreetPart;
}

function inferCaptionAddress(caption) {
  const line = captionLines(caption).find(candidate => candidate.length <= 180 && isAddressLine(candidate));
  return line ? line.replace(/^[^\p{L}\p{N}]+/u, "").trim() : "";
}

function externalMentions(record) {
  return [...new Set(
    [...clean(record.caption).matchAll(/@([\w.]{2,30})/g)]
      .map(match => match[1])
      .filter(handle => handle.toLowerCase() !== clean(record.handle).toLowerCase())
  )];
}

function inferPlaceName(record) {
  const lines = captionLines(record.caption);
  const addressIndex = lines.findIndex(isAddressLine);
  const nameBeforeAddress = addressIndex > 0 ? lines[addressIndex - 1] : "";
  const mentions = externalMentions(record);
  const captionFirst = clean(record.caption).split(/[\n.!?|]/)[0].replace(/^(@[\w.]+\s*)+/, "").trim();
  if (record.title && record.title.length < 80 && !record.title.startsWith("http")) return record.title;
  if (nameBeforeAddress && nameBeforeAddress.length >= 2 && nameBeforeAddress.length <= 70 && !/[.!?]$/.test(nameBeforeAddress) && !nameBeforeAddress.startsWith("#")) return nameBeforeAddress;
  if (mentions.length === 1) return displayName(mentions[0]);
  if (captionFirst.length >= 3 && captionFirst.length <= 70) return captionFirst;
  return displayName(record.handle);
}

function enrichRecord(record) {
  const text = [record.caption, record.collectionName, record.handle, record.title].join(" ").toLowerCase();
  const [category, categoryScore] = inferCategory(text);
  const cityHit = inferCity(text);
  const placeName = inferPlaceName(record);
  const address = inferCaptionAddress(record.caption);
  const hasIdentity = Boolean(record.handle || record.url || placeName);
  const confidence = Math.min(0.96, 0.28 + (hasIdentity ? 0.22 : 0) + (categoryScore ? 0.18 : 0) + (cityHit ? 0.22 : 0) + (address ? 0.14 : 0));
  const status = category === "Inspiration" ? "Not Mappable" : "Needs Review";
  const reasons = [];
  if (record.handle) reasons.push("profile handle found");
  if (categoryScore) reasons.push(`${category.toLowerCase()} keywords matched`);
  if (cityHit) reasons.push(`${cityHit[0]} mentioned in source text`);
  if (address) reasons.push("street address extracted from caption");
  if (!cityHit) reasons.push("no reliable location found");
  if (cityHit && !address && !clean(record.title) && externalMentions(record).length === 0) reasons.push("exact place not identifiable from city-only source");

  const item = {
    id: makeId(),
    category,
    status,
    placeName,
    address,
    city: cityHit?.[0] || "",
    country: cityHit?.[1] || "",
    latitude: "",
    longitude: "",
    instagramHandle: clean(record.handle).replace(/^@/, ""),
    instagramUrl: safeUrl(record.url),
    collectionName: clean(record.collectionName),
    notes: "",
    confidence: Number(confidence.toFixed(2)),
    matchReason: reasons.join("; "),
    googlePlaceId: "",
    googleBusinessStatus: "",
    googleVerifiedAt: "",
    googleMatchScore: "",
    googleMapsUrl: "",
    website: "",
    caption: clean(record.caption),
    savedAt: clean(record.savedAt),
    mediaType: clean(record.mediaType),
    sourceFile: clean(record.sourceFile),
    sourcePath: clean(record.sourcePath)
  };
  item.googleMapsUrl = mapsUrl(item);
  return item;
}

export function expandItemWithGemini(item, places) {
  if (!item || !Array.isArray(places) || !places.length) return item ? [item] : [];
  return places.map(place => {
    const address = clean(place.addressClue);
    const brandName = clean(place.brandName);
    const evidence = clean(place.evidence);
    const expanded = {
      ...item,
      id: makeId(),
      category: CATEGORIES.includes(place.category) ? place.category : "Unknown",
      status: "Needs Review",
      placeName: brandName || item.placeName,
      address,
      city: clean(place.city),
      country: clean(place.country),
      latitude: "",
      longitude: "",
      confidence: Math.max(Number(item.confidence) || 0, Math.min(1, Math.max(0, Number(place.confidence) || 0))),
      matchReason: `${clean(item.matchReason)}; Gemini extracted ${brandName}${evidence ? ` from: ${evidence}` : ""}`.replace(/^;\s*/, ""),
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

export function shouldAutoVerifyGoogle(item) {
  if (!item?.address || item.googlePlaceId || isUnidentifiedPlace(item)) return false;
  return !["Rejected", "Not Mappable"].includes(item.status);
}

export function markAddressReady(item) {
  return item?.address ? { ...item, status: "Address Ready" } : item;
}

export function isCoordinatePair(item = {}) {
  if (item.latitude == null || item.longitude == null || item.latitude === "" || item.longitude === "") return false;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function isPlausibleLocation(item = {}) {
  if (!isCoordinatePair(item)) return false;
  if (!/vietnam/i.test(clean(item.country))) return true;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return latitude >= 8 && latitude <= 24.5 && longitude >= 102 && longitude <= 110.5;
}

export function isMappable(item = {}) {
  return MAPPABLE_STATUSES.has(item.status) && isPlausibleLocation(item);
}

export function normalizePlace(record = {}) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const { raw: _discardedRaw, ...item } = source;
  return {
    id: "",
    instagramUrl: "",
    instagramHandle: "",
    caption: "",
    collectionName: "",
    category: "Unknown",
    status: "Needs Review",
    placeName: "",
    address: "",
    city: "",
    country: "",
    latitude: "",
    longitude: "",
    confidence: 0,
    matchReason: "",
    googlePlaceId: "",
    googleBusinessStatus: "",
    googleMapsUrl: "",
    ...item,
    googleCandidates: Array.isArray(item.googleCandidates) ? item.googleCandidates : [],
    groundedCandidates: Array.isArray(item.groundedCandidates) ? item.groundedCandidates : [],
    groundedSources: Array.isArray(item.groundedSources) ? item.groundedSources : []
  };
}

export function researchState(item = {}) {
  if (clean(item.googlePlaceId)) return "Ready";
  if (item.geminiRequiresMedia || item.researchState === "Visual access required") return "Visual access required";
  if ((Array.isArray(item.googleCandidates) && item.googleCandidates.length)
    || (Array.isArray(item.groundedCandidates) && item.groundedCandidates.length)
    || item.researchState === "Review") return "Review";
  return "Unresolved";
}

export function coordinatesApproved(item = {}) {
  return MAPPABLE_STATUSES.has(item.status) && isCoordinatePair(item);
}

export function mapState(item = {}) {
  if (clean(item.googlePlaceId)) return "Google verified";
  if (coordinatesApproved(item)) return "Map ready";
  if (clean(item.address)) return "Address found";
  return "No address";
}

export function placeNeedsAttention(item = {}) {
  const research = researchState(item);
  const map = mapState(item);
  return research !== "Ready" || map === "Address found" || map === "No address" || !isCoordinatePair(item);
}

export function attentionReason(item = {}) {
  if (item.geminiRequiresMedia) return "The identifying information appears only inside the Instagram media.";
  if (item.researchFailure) return `Research failed: ${item.researchFailure}`;
  if (Array.isArray(item.googleCandidates) && item.googleCandidates.length) return `${item.googleCandidates.length} Google Places candidate${item.googleCandidates.length === 1 ? "" : "s"} need review.`;
  if (Array.isArray(item.groundedCandidates) && item.groundedCandidates.length) return `${item.groundedCandidates.length} grounded research candidate${item.groundedCandidates.length === 1 ? "" : "s"} need review.`;
  const evidence = `${clean(item.matchReason)} ${clean(item.geminiMediaOutcome)}`.toLowerCase();
  if (evidence.includes("multiple") || evidence.includes("branch")) return "The exact branch is unclear.";
  if (evidence.includes("conflict")) return "The address conflicts with the source evidence.";
  if (clean(item.googlePlaceId) && !isCoordinatePair(item)) return "Google verified the listing, but coordinates are still missing for mapping.";
  if (!clean(item.placeName) || /untitled|saved post/i.test(clean(item.placeName))) return "No identifiable place was found in the supplied source.";
  if (mapState(item) === "No address") return "A street address is still missing.";
  if (mapState(item) === "Address found") return "The address is known, but approved coordinates are still missing.";
  if (researchState(item) !== "Ready") return "Research has not yet confirmed this place.";
  return "Research is complete and this place is ready to map.";
}

const VERIFICATION_INPUTS = ["placeName", "address", "city", "country", "latitude", "longitude"];

export function applyPlacePatch(item = {}, patch = {}) {
  const merged = { ...item, ...patch };
  const verificationInputChanged = VERIFICATION_INPUTS.some(key => Object.hasOwn(patch, key) && patch[key] !== item[key]);
  const suppliesFreshVerification = clean(patch.googlePlaceId);
  if (!verificationInputChanged || suppliesFreshVerification) return merged;
  return {
    ...merged,
    googlePlaceId: "",
    googleMapsUrl: "",
    googleBusinessStatus: "",
    googleVerifiedAt: "",
    googleMatchScore: "",
    googleCandidates: [],
    groundedCandidates: [],
    researchState: "Unresolved"
  };
}

export function reviewReason(item = {}) {
  const evidence = `${clean(item.matchReason)} ${clean(item.notes)}`;
  if (item.geminiMediaAnalyzedAt && item.geminiMediaOutcome === "none") {
    return { label: "No identifiable place in supplied media", detail: "The selected media did not reveal a reliable physical venue." };
  }
  if (item.geminiRequiresMedia) {
    return { label: "Reel image required", detail: "Add reel or carousel media so the visible venue can be identified." };
  }
  if (/address conflict|differs between/i.test(evidence)) {
    return { label: "Address conflict", detail: "The available sources disagree about this venue's address." };
  }
  if (/multiple google matches|multiple places matches|ambiguous google/i.test(evidence)) {
    return { label: "Multiple Google matches", detail: "Choose the official listing that matches this branch." };
  }
  if (/branch unclear|exact branch/i.test(evidence)) {
    return { label: "Exact branch unclear", detail: "The venue is known, but its specific branch still needs confirmation." };
  }
  if (isUnidentifiedPlace(item)) {
    return { label: "Exact place not identifiable", detail: "The source identifies a city or post, but not a reliable physical venue." };
  }
  if (["Rejected", "Not Mappable"].includes(item.status)) {
    return { label: "Not mapped", detail: "This record is excluded from map export." };
  }
  if (item.googlePlaceId) {
    return { label: "Google verified", detail: "Google Places supplied the official listing details." };
  }
  if (isMappable(item)) {
    return { label: "Map ready", detail: "This record has approved coordinates and can be exported to the map." };
  }
  if (!clean(item.address)) {
    return { label: "Address missing", detail: "Add a street address or identify the exact branch before mapping." };
  }
  return { label: "Google listing not verified", detail: "The address is ready for an official Google Place match." };
}

function csvCell(value) {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

function exportRow(item) {
  return {
    "IG Link": item.instagramUrl,
    "Google Maps": mapsUrl(item),
    "Brand Name": item.placeName,
    City: item.city,
    Address: item.address
  };
}

export function buildCsv(items = []) {
  return [
    EXPORT_COLUMNS.map(csvCell).join(","),
    ...items.map(item => {
      const row = exportRow(item);
      return EXPORT_COLUMNS.map(column => csvCell(row[column])).join(",");
    })
  ].join("\r\n");
}

function xmlText(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function htmlText(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlAttribute(value) {
  return htmlText(value).replace(/"/g, "&quot;");
}

function compactLocation(item) {
  const address = clean(item.address);
  const parts = address ? [address] : [];
  if (item.city && !address.toLowerCase().includes(clean(item.city).toLowerCase())) parts.push(clean(item.city));
  const joined = parts.join(", ");
  if (item.country && !joined.toLowerCase().includes(clean(item.country).toLowerCase())) parts.push(clean(item.country));
  return parts.join(", ");
}

export function buildKml(items = [], collectionLabel = "All collections", categoryLabel = "All categories") {
  const placemarks = items.map(item => {
    const googleMapsUrl = mapsUrl(item) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`;
    const businessStatus = item.googlePlaceId ? (item.googleBusinessStatus || "VERIFIED") : "NOT VERIFIED";
    const description = `Category: ${htmlText(item.category)}<br>Address: ${htmlText(compactLocation(item))}<br>Google business status: ${htmlText(businessStatus)}<br><a href="${htmlAttribute(googleMapsUrl)}">Open in Google Maps</a>`;
    return `    <Placemark><name>${xmlText(item.placeName)}</name><description><![CDATA[${description}]]></description><Point><coordinates>${item.longitude},${item.latitude},0</coordinates></Point></Placemark>`;
  }).join("\n");
  const documentName = xmlText([collectionLabel || "All collections", categoryLabel || "All categories"].join(" - "));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document><name>Pinboard Atlas - ${documentName}</name>\n${placemarks}\n  </Document>\n</kml>\n`;
}
