export const PLACE_CATEGORIES = Object.freeze([
  "Food", "Cafe", "Bar", "Hotel", "Attraction", "Shopping", "Fashion",
  "Beauty", "Wellness", "Transport", "Event", "Inspiration", "Unknown"
]);

const categorySet = new Set(PLACE_CATEGORIES);

export function normalizeGeminiPayload(value, allowedSourceIds = null) {
  const results = Array.isArray(value?.results) ? value.results : [];
  return {
    results: results.flatMap(result => {
      const sourceId = clean(result?.sourceId).slice(0, 160);
      if (!sourceId || (allowedSourceIds && !allowedSourceIds.has(sourceId))) return [];
      const places = normalizeGeminiPlaces(result?.places);
      return places.length ? [{ sourceId, places }] : [];
    })
  };
}

export function normalizeGeminiPlaces(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap(place => {
    const brandName = clean(place?.brandName).slice(0, 160);
    if (!brandName) return [];
    const category = categorySet.has(clean(place?.category)) ? clean(place.category) : "Unknown";
    const confidence = Number(place?.confidence);
    return [{
      brandName,
      category,
      city: clean(place?.city).slice(0, 120),
      country: clean(place?.country).slice(0, 120),
      addressClue: clean(place?.addressClue).slice(0, 300),
      searchQuery: clean(place?.searchQuery).slice(0, 300) || brandName,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      evidence: clean(place?.evidence).slice(0, 500),
      requiresMedia: Boolean(place?.requiresMedia)
    }];
  });
}

export function buildGeminiRequest(posts) {
  const safePosts = posts.slice(0, 10).map(post => ({
    sourceId: clean(post?.sourceId).slice(0, 160),
    instagramHandle: clean(post?.instagramHandle).slice(0, 120),
    instagramUrl: clean(post?.instagramUrl).slice(0, 500),
    collectionName: clean(post?.collectionName).slice(0, 160),
    caption: clean(post?.caption).slice(0, 2400),
    currentName: clean(post?.placeName).slice(0, 160)
  }));

  const prompt = [
    "Extract physical travel venues or businesses from these Instagram saved-post records.",
    "Return one result per sourceId and one place object per distinct venue or branch.",
    "Use only evidence in the supplied record. Never invent an address, city, country, branch, or business name.",
    "When the caption names a seller through an @handle, the mentioned profile may be the business.",
    "If the venue appears to be hidden in reel or carousel media that was not supplied, return no speculative place and set requiresMedia=true only on a named candidate that still needs media confirmation.",
    "addressClue must contain only an address or location phrase supported by the record.",
    "searchQuery should combine the supported business name and location clues for a later place search.",
    `Allowed categories: ${PLACE_CATEGORIES.join(", ")}.`,
    `Records: ${JSON.stringify(safePosts)}`
  ].join("\n");

  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema()
    }
  };
}

export function buildGeminiMediaRequest(post, file) {
  const safePost = {
    sourceId: clean(post?.sourceId).slice(0, 160),
    instagramHandle: clean(post?.instagramHandle).slice(0, 120),
    instagramUrl: clean(post?.instagramUrl).slice(0, 500),
    collectionName: clean(post?.collectionName).slice(0, 160),
    caption: clean(post?.caption).slice(0, 2400),
    currentName: clean(post?.placeName).slice(0, 160)
  };
  const prompt = [
    "Inspect this Instagram reel, video, or screenshot for physical travel venues and businesses.",
    "Read on-screen text, signs, menus, captions embedded in frames, and visible account or business names.",
    "Return one result for the supplied sourceId and one place object per distinct venue or branch.",
    "Use only visual evidence in the supplied media and the accompanying caption. Never invent an address, branch, city, or business name from a broad location label.",
    "Evidence must briefly state what was observed. Include a timestamp when the clue comes from video.",
    "Set requiresMedia=false because the media is supplied. If no named physical venue is identifiable, return an empty places array.",
    "Do not provide coordinates. Google Places will verify official listings later.",
    `Allowed categories: ${PLACE_CATEGORIES.join(", ")}.`,
    `Record: ${JSON.stringify(safePost)}`
  ].join("\n");

  return {
    contents: [{ role: "user", parts: [
      { text: prompt },
      { fileData: { fileUri: clean(file?.fileUri), mimeType: clean(file?.mimeType) } }
    ] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema()
    }
  };
}
export function parseGeminiResponse(response, allowedSourceIds) {
  const text = (response?.candidates || []).flatMap(candidate => candidate?.content?.parts || []).map(part => clean(part?.text)).filter(Boolean).join("");
  if (!text) return { results: [], responseValid: false };
  try {
    const payload = JSON.parse(text);
    if (!validGeminiPayload(payload, allowedSourceIds)) return { results: [], responseValid: false };
    return { ...normalizeGeminiPayload(payload, allowedSourceIds), responseValid: true };
  } catch {
    return { results: [], responseValid: false };
  }
}

function validGeminiPayload(payload, allowedSourceIds) {
  if (!Array.isArray(payload?.results)) return false;
  const expected = allowedSourceIds instanceof Set ? allowedSourceIds : null;
  const seen = new Set();
  for (const result of payload.results) {
    const sourceId = clean(result?.sourceId).slice(0, 160);
    if (!sourceId || seen.has(sourceId) || !Array.isArray(result?.places)) return false;
    if (expected && !expected.has(sourceId)) return false;
    seen.add(sourceId);
  }
  if (!expected) return true;
  if (seen.size !== expected.size) return false;
  return [...expected].every(sourceId => seen.has(sourceId));
}

export async function executeCaptionExtraction({ posts, model, apiKey, reserve, record, fetchImpl = fetch }) {
  const allowedSourceIds = new Set(posts.map(post => clean(post?.sourceId).slice(0, 160)).filter(Boolean));
  let requestPayload = buildGeminiRequest(posts);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const usageReservation = await reserve("gemini", {
      requests: 1,
      estimatedTokens: Math.max(1, Math.ceil(JSON.stringify(requestPayload).length / 4))
    });
    if (!usageReservation.allowed) return { kind: "usage-block", reservation: usageReservation };

    let response;
    try {
      response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(45000)
      });
    } catch (error) {
      await record(usageReservation.reservation, { success: false });
      throw error;
    }

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      await record(usageReservation.reservation, { success: false, usageMetadata: responseBody?.usageMetadata });
      return { kind: "upstream-error", status: response.status, responseBody };
    }
    const parsed = parseGeminiResponse(responseBody, allowedSourceIds);
    if (parsed.responseValid) {
      const usage = await record(usageReservation.reservation, { success: true, usageMetadata: responseBody?.usageMetadata });
      return { kind: "success", result: parsed, usage };
    }
    const usage = await record(usageReservation.reservation, { success: false, usageMetadata: responseBody?.usageMetadata });
    if (attempt === 1) return { kind: "unreadable", usage };
    requestPayload = buildGeminiRequest(posts);
    requestPayload.contents[0].parts[0].text += "\nRepair instruction: return only one valid JSON object matching the requested shape.";
  }
}

function responseSchema() {
  const string = { type: "STRING" };
  return {
    type: "OBJECT",
    properties: {
      results: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            sourceId: string,
            places: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  brandName: string,
                  category: { type: "STRING", enum: PLACE_CATEGORIES },
                  city: string,
                  country: string,
                  addressClue: string,
                  searchQuery: string,
                  confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
                  evidence: string,
                  requiresMedia: { type: "BOOLEAN" }
                },
                required: ["brandName", "category", "city", "country", "addressClue", "searchQuery", "confidence", "evidence", "requiresMedia"]
              }
            }
          },
          required: ["sourceId", "places"]
        }
      }
    },
    required: ["results"]
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

