import { expandItemWithGemini } from "./domain.js";

const DEFAULT_CAPTION_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 2;
const MIN_AI_CONFIDENCE = 0.8;

export async function runResearchPipeline(items, clients, options = {}) {
  const captionResult = await captionStage(items, clients.extractCaptions, options);
  const extracted = captionResult.places;
  let hardCapError = captionResult.hardCapError;
  let groundingCapError = "";
  const researched = await mapWithConcurrency(extracted, options.concurrency || DEFAULT_CONCURRENCY, async place => {
    let directCandidates = [];
    if (place.researchFailure || place.geminiRequiresMedia || place.aiConfidenceInsufficient) return place;
    if (hardCapError) return stopForHardCap(place, hardCapError);
    if (clients.googlePlacesAvailable === false) {
      return prerequisiteUnavailable(place, "Google Places is unavailable, so grounded research was not started.");
    }

    try {
      progress(options, "places-lookup", `Looking up ${place.placeName || "place"} in Google Places`, place);
      const direct = await clients.searchPlaces(place);
      if (direct.length === 1 && isExactCandidate(place, direct[0])) return applyGoogleCandidate(place, direct[0]);
      if (direct.length > 1) return markForReview(place, direct, "Multiple Google Places branches require review.");
      directCandidates = direct.length === 1 ? direct : [];

      if (hardCapError) return preserveDirectFailure(place, directCandidates, hardCapError);
      if (groundingCapError) return preserveDirectFailure(place, directCandidates, groundingCapError);
      progress(options, "grounded-research", `Researching ${place.placeName || "place"} with grounded search`, place);
      let grounded;
      try {
        grounded = await clients.groundPlace(place);
      } catch (error) {
        const failure = errorMessage(error);
        if (isGroundingCap(error)) groundingCapError = failure;
        return preserveDirectFailure(place, directCandidates, failure);
      }
      const groundedPlaces = expandGroundedCandidates(place, grounded?.places);
      if (!groundedPlaces.length) return markUnresolved(place, grounded, directCandidates, Array.isArray(grounded?.places) && grounded.places.length ? "Grounded research confidence was too low to identify an exact venue." : "");
      if (groundedPlaces.length > 1) {
        return markGroundedForReview(place, groundedPlaces, hardCapError || "Grounded research found multiple possible places or branches.", directCandidates);
      }

      const candidate = groundedPlaces[0];
      if (candidate.geminiRequiresMedia) {
        return markGroundedForReview(place, groundedPlaces, "Grounded research requires visual access to confirm the exact venue.", directCandidates);
      }
      if (hardCapError || groundingCapError) return preserveGroundedFailure(candidate, hardCapError || groundingCapError, directCandidates);
      try {
        progress(options, "final-verification", `Verifying ${candidate.placeName || "place"} in Google Places`, candidate);
        const verified = await clients.searchPlaces(candidate);
        return verified.length === 1 && isExactCandidate(candidate, verified[0])
          ? applyGoogleCandidate(candidate, verified[0])
          : markForReview(candidate, mergeGoogleCandidates(directCandidates, verified), verified.length > 1 ? "Multiple Google Places branches require review." : "No exact Google Places match was verified.");
      } catch (error) {
        const failure = errorMessage(error);
        if (error?.code === "local_budget_exhausted") hardCapError = failure;
        return preserveGroundedFailure(candidate, failure, directCandidates);
      }
    } catch (error) {
      const failure = errorMessage(error);
      if (error?.code === "local_budget_exhausted") hardCapError = failure;
      return preserveDirectFailure(place, directCandidates, failure);
    }
  });

  return { places: researched, summary: { ...summarize(researched), hardCapReached: Boolean(hardCapError || groundingCapError) } };
}

async function captionStage(items, extractCaptions, options) {
  const batchSize = Math.max(1, Number(options.captionBatchSize) || DEFAULT_CAPTION_BATCH_SIZE);
  const expanded = [];
  let hardCapError = "";
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    progress(options, "caption-extraction", `Extracting caption clues ${start + 1}-${start + batch.length} of ${items.length}`);
    try {
      const results = await extractCaptions(batch);
      const byId = new Map((Array.isArray(results) ? results : []).map(result => [result.sourceId, result.places]));
      for (const item of batch) {
        const suggestions = byId.get(item.id) || [];
        if (!suggestions.length) {
          expanded.push({ ...item, status: "Needs Review", researchState: "Unresolved", matchReason: item.matchReason || "No identifiable physical venue was found in the caption." });
          continue;
        }
        const confidentSuggestions = suggestions.filter(suggestion => Number(suggestion?.confidence) >= MIN_AI_CONFIDENCE || suggestion?.requiresMedia === true);
        if (!confidentSuggestions.length) {
          expanded.push({ ...item, status: "Needs Review", researchState: "Unresolved", aiConfidenceInsufficient: true, matchReason: appendReason(item.matchReason, "Gemini confidence was too low to identify an exact venue.") });
          continue;
        }
        expanded.push(...expandItemWithGemini(item, confidentSuggestions).map(place => ({
          ...place,
          researchState: place.geminiRequiresMedia ? "Visual access required" : "Review"
        })));
      }
    } catch (error) {
      const failure = errorMessage(error);
      expanded.push(...batch.map(item => ({ ...item, status: "Needs Review", researchState: "Unresolved", researchFailure: failure })));
      if (error?.code === "local_budget_exhausted") {
        hardCapError = failure;
        expanded.push(...items.slice(start + batch.length).map(item => ({ ...item, status: "Needs Review", researchState: "Unresolved", researchFailure: failure })));
        break;
      }
    }
  }
  return { places: expanded, hardCapError };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

function expandGroundedCandidates(place, candidates) {
  if (!Array.isArray(candidates)) return [];
  const confident = candidates.filter(candidate => Number(candidate?.confidence) >= MIN_AI_CONFIDENCE || candidate?.requiresVisualAccess === true);
  return confident.map((candidate, index) => ({
    ...place,
    id: confident.length === 1 ? place.id : `${place.id}-grounded-${index + 1}`,
    placeName: clean(candidate.brandName) || place.placeName,
    category: clean(candidate.category) || place.category,
    address: clean(candidate.address),
    city: clean(candidate.city) || place.city,
    country: clean(candidate.country) || place.country,
    confidence: Math.max(Number(place.confidence) || 0, Number(candidate.confidence) || 0),
    geminiSearchQuery: clean(candidate.searchQuery) || clean(candidate.brandName),
    geminiRequiresMedia: candidate.requiresVisualAccess === true,
    groundedSources: Array.isArray(candidate.sources) ? candidate.sources : [],
    matchReason: appendReason(place.matchReason, candidate.evidence ? `Grounded research: ${clean(candidate.evidence)}` : "Grounded research found a candidate."),
    researchState: candidate.requiresVisualAccess === true ? "Visual access required" : "Review"
  }));
}

function isExactCandidate(place, candidate) {
  if (!candidate) return false;
  const placeName = normalized(place.placeName);
  const candidateName = normalized(candidate.name);
  if (!placeName || !candidateName || placeName !== candidateName) return false;
  const candidateLocation = normalized([candidate.address, candidate.city, candidate.country].filter(Boolean).join(" "));
  const city = normalized(place.city);
  const country = normalized(place.country);
  if (!city && !country) return false;
  if (city && !containsPhrase(candidateLocation, city)) return false;
  if (country && !containsPhrase(candidateLocation, country)) return false;
  if (candidate.city && city && normalized(candidate.city) !== city) return false;
  if (candidate.country && country && normalized(candidate.country) !== country) return false;
  return true;
}

function applyGoogleCandidate(place, candidate) {
  return {
    ...place,
    placeName: candidate.name || place.placeName,
    address: candidate.address || place.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    googlePlaceId: candidate.id,
    googleMapsUrl: candidate.googleMapsUrl || "",
    googleBusinessStatus: candidate.businessStatus || "",
    googleVerifiedAt: new Date().toISOString(),
    status: "Approved",
    researchState: "Ready",
    researchFailure: ""
  };
}

function markUnresolved(place, grounded, googleCandidates = [], reason = "") {
  const requiresVisualAccess = Boolean(grounded?.requiresVisualAccess);
  return {
    ...place,
    status: "Needs Review",
    geminiRequiresMedia: requiresVisualAccess || Boolean(place.geminiRequiresMedia),
    researchState: requiresVisualAccess ? "Visual access required" : googleCandidates.length ? "Review" : "Unresolved",
    ...(googleCandidates.length ? { googleCandidates } : {}),
    matchReason: appendReason(place.matchReason, reason || (requiresVisualAccess ? "The exact venue is visible only in Instagram media." : "Grounded research did not identify an exact physical venue."))
  };
}

function markForReview(place, candidates, reason) {
  return {
    ...place,
    status: "Needs Review",
    researchState: "Review",
    googleCandidates: Array.isArray(candidates) ? candidates : [],
    matchReason: appendReason(place.matchReason, reason)
  };
}

function markGroundedForReview(place, candidates, reason, googleCandidates = []) {
  const requiresVisualAccess = candidates.some(candidate => candidate.geminiRequiresMedia);
  return {
    ...place,
    status: "Needs Review",
    researchState: candidates.every(candidate => candidate.geminiRequiresMedia) ? "Visual access required" : "Review",
    geminiRequiresMedia: requiresVisualAccess || Boolean(place.geminiRequiresMedia),
    groundedCandidates: candidates.map(toGroundedReviewCandidate),
    ...(googleCandidates.length ? { googleCandidates } : {}),
    researchFailure: reason && /cap reached/i.test(reason) ? reason : place.researchFailure,
    matchReason: appendReason(place.matchReason, reason)
  };
}

function toGroundedReviewCandidate(candidate) {
  return {
    placeName: candidate.placeName,
    category: candidate.category,
    address: candidate.address,
    city: candidate.city,
    country: candidate.country,
    confidence: candidate.confidence,
    searchQuery: candidate.geminiSearchQuery,
    requiresVisualAccess: Boolean(candidate.geminiRequiresMedia),
    sources: candidate.groundedSources || [],
    evidence: candidate.matchReason
  };
}

function preserveGroundedFailure(candidate, failure, googleCandidates = []) {
  return {
    ...candidate,
    status: "Needs Review",
    researchState: candidate.geminiRequiresMedia ? "Visual access required" : "Review",
    groundedCandidates: [toGroundedReviewCandidate(candidate)],
    ...(googleCandidates.length ? { googleCandidates } : {}),
    researchFailure: failure
  };
}

function preserveDirectFailure(place, googleCandidates, failure) {
  return {
    ...place,
    status: "Needs Review",
    researchState: googleCandidates.length ? "Review" : "Unresolved",
    ...(googleCandidates.length ? { googleCandidates } : {}),
    researchFailure: failure
  };
}

function mergeGoogleCandidates(...groups) {
  const byId = new Map();
  for (const candidate of groups.flat()) {
    if (candidate?.id && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return [...byId.values()];
}

function stopForHardCap(place, failure) {
  return { ...place, status: "Needs Review", researchState: "Unresolved", researchFailure: failure };
}

function prerequisiteUnavailable(place, failure) {
  return { ...place, status: "Needs Review", researchState: "Review", researchFailure: failure };
}

function summarize(places) {
  return places.reduce((summary, place) => {
    summary.total += 1;
    if (place.googlePlaceId) summary.googleVerified += 1;
    if (place.geminiRequiresMedia) summary.visualAccessRequired += 1;
    if (place.researchFailure) summary.failed += 1;
    if (!place.googlePlaceId && !place.geminiRequiresMedia) summary.needsReview += 1;
    return summary;
  }, { total: 0, googleVerified: 0, visualAccessRequired: 0, needsReview: 0, failed: 0 });
}

function progress(options, stage, message, place) {
  options.onProgress?.({ stage, message, placeId: place?.id || "" });
}

function normalized(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function containsPhrase(value, phrase) {
  return ` ${value} `.includes(` ${phrase} `);
}

function appendReason(current, reason) {
  return [clean(current), clean(reason)].filter(Boolean).join("; ");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : clean(error) || "Research request failed.";
}

function isGroundingCap(error) {
  return error?.code === "local_budget_exhausted"
    && (error?.operation === "groundedGemini" || /ground/i.test(errorMessage(error)));
}

function clean(value) {
  return String(value ?? "").trim();
}
