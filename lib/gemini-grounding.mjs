export function buildGroundingRequest(place) {
  return {
    contents: [{ role: "user", parts: [{ text: groundedPrompt(place) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1 }
  };
}

export function parseGroundingResponse(response, sourceId) {
  const text = response?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
  const payload = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  if (!Array.isArray(payload?.places)) throw new SyntaxError("Grounded response must contain a places array");
  const citations = citationList(response?.candidates?.[0]?.groundingMetadata);
  return normalizeGroundedResult(payload, sourceId, citations);
}

export async function executeGroundingResearch({ place, model, apiKey, reserve, record, fetchImpl = fetch }) {
  const sourceId = clean(place?.sourceId).slice(0, 160);
  let requestPayload = buildGroundingRequest({ ...place, sourceId });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const usageReservation = await reserve("groundedGemini", {
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

    try {
      const result = parseGroundingResponse(responseBody, sourceId);
      const usage = await record(usageReservation.reservation, { success: true, usageMetadata: responseBody?.usageMetadata });
      return { kind: "success", result, usage };
    } catch {
      const usage = await record(usageReservation.reservation, { success: false, usageMetadata: responseBody?.usageMetadata });
      if (attempt === 1) return { kind: "unreadable", usage };
      requestPayload = buildGroundingRequest({ ...place, sourceId });
      requestPayload.contents[0].parts[0].text += "\nRepair instruction: return only one valid JSON object matching the requested shape.";
    }
  }
}

function groundedPrompt(place) {
  const record = {
    sourceId: clean(place?.sourceId).slice(0, 160),
    instagramHandle: clean(place?.instagramHandle).slice(0, 120),
    placeName: clean(place?.placeName).slice(0, 160),
    caption: clean(place?.caption).slice(0, 2400),
    city: clean(place?.city).slice(0, 120),
    country: clean(place?.country).slice(0, 120)
  };
  return [
    "Research this one travel place using Google Search grounding.",
    "Return JSON with a places array. Each place may contain brandName, category, city, country, address, searchQuery, confidence, evidence, and requiresVisualAccess.",
    "Use only claims supported by the grounded sources. Do not infer an address without cited evidence.",
    "Set requiresVisualAccess=true only when the source explicitly says the place is visible only in media; otherwise set it to false.",
    "Return at most 8 plausible physical venues or branches and no commentary outside the JSON.",
    `Source record: ${JSON.stringify(record)}`
  ].join("\n");
}

function citationList(metadata) {
  const seen = new Set();
  return (metadata?.groundingChunks || []).flatMap(chunk => {
    const url = clean(chunk?.web?.uri);
    if (!isWebUrl(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ title: clean(chunk?.web?.title).slice(0, 240), url }];
  });
}

function normalizeGroundedResult(payload, sourceId, citations) {
  const places = (Array.isArray(payload?.places) ? payload.places : []).flatMap(place => {
    const brandName = clean(place?.brandName).slice(0, 160);
    if (!brandName) return [];
    const rawConfidence = place?.confidence;
    const hasNumericConfidence = typeof rawConfidence === "number"
      || (typeof rawConfidence === "string" && rawConfidence.trim() !== "");
    const confidence = hasNumericConfidence ? Number(rawConfidence) : Number.NaN;
    const sources = mergeSources(citations);
    return [{
      brandName,
      category: clean(place?.category).slice(0, 80),
      city: clean(place?.city).slice(0, 120),
      country: clean(place?.country).slice(0, 120),
      address: clean(place?.address).slice(0, 300),
      searchQuery: clean(place?.searchQuery).slice(0, 300) || brandName,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      evidence: clean(place?.evidence).slice(0, 500),
      requiresVisualAccess: place?.requiresVisualAccess === true,
      sources
    }];
  }).slice(0, 8);
  return { sourceId: clean(sourceId).slice(0, 160), places };
}

function mergeSources(citations) {
  const seen = new Set();
  return citations.flatMap(source => {
    const url = clean(source?.url || source?.uri);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ title: clean(source?.title).slice(0, 240), url }];
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function isWebUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}
