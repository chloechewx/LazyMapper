import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runResearchPipeline } from "../src/lib/research-pipeline.js";

function fixturePost(id = "post-1", overrides = {}) {
  return {
    id,
    instagramUrl: `https://www.instagram.com/p/${id}/`,
    instagramHandle: "travelnotes",
    caption: "Cafe A in Taipei",
    collectionName: "Taipei",
    category: "Unknown",
    status: "Needs Review",
    placeName: "Saved post",
    address: "",
    city: "Taipei",
    country: "Taiwan",
    latitude: "",
    longitude: "",
    confidence: 0.4,
    matchReason: "Imported from Instagram",
    googlePlaceId: "",
    googleBusinessStatus: "",
    googleMapsUrl: "",
    ...overrides
  };
}

function extracted(sourceId, overrides = {}) {
  return {
    sourceId,
    places: [{
      brandName: "Cafe A",
      category: "Cafe",
      addressClue: "",
      city: "Taipei",
      country: "Taiwan",
      confidence: 0.9,
      evidence: "Named in caption",
      searchQuery: "Cafe A Taipei",
      requiresMedia: false,
      ...overrides
    }]
  };
}

function googleCandidate(overrides = {}) {
  return {
    id: "google-a",
    name: "Cafe A",
    address: "10 Yongkang St, Taipei, Taiwan",
    latitude: 25.03,
    longitude: 121.53,
    googleMapsUrl: "https://maps.google.com/?cid=1",
    businessStatus: "OPERATIONAL",
    website: "",
    type: "Cafe",
    ...overrides
  };
}

{
  const calls = [];
  const clients = {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async place => {
      calls.push(`places:${place.placeName}`);
      return [googleCandidate()];
    },
    groundPlace: async place => {
      calls.push(`ground:${place.id}`);
      return { places: [] };
    }
  };

  const result = await runResearchPipeline([fixturePost()], clients, { captionBatchSize: 10, concurrency: 2 });
  assert.equal(result.places[0].googlePlaceId, "google-a");
  assert.equal(result.summary.googleVerified, 1);
  assert.deepEqual(calls, ["places:Cafe A"]);
}

{
  const calls = [];
  const clients = {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async place => {
      calls.push(`places:${place.placeName}`);
      return calls.length === 1 ? [] : [googleCandidate({ name: "Grounded Cafe" })];
    },
    groundPlace: async place => {
      calls.push(`ground:${place.id}`);
      return { places: [{ brandName: "Grounded Cafe", category: "Cafe", city: "Taipei", country: "Taiwan", confidence: 0.88, evidence: "Official site", searchQuery: "Grounded Cafe Taipei", requiresVisualAccess: false, sources: [{ title: "Official", url: "https://example.com" }] }] };
    }
  };

  const result = await runResearchPipeline([fixturePost()], clients);
  assert.equal(result.places[0].googlePlaceId, "google-a");
  assert.deepEqual(calls.map(call => call.split(":")[0]), ["places", "ground", "places"]);
}

{
  let searchCalls = 0;
  let groundCalls = 0;
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { requiresMedia: true })),
    searchPlaces: async () => { searchCalls += 1; return []; },
    groundPlace: async () => { groundCalls += 1; return { places: [] }; }
  });
  assert.equal(result.places[0].geminiRequiresMedia, true);
  assert.equal(searchCalls, 0);
  assert.equal(groundCalls, 0);
}

{
  const result = await runResearchPipeline([fixturePost("good"), fixturePost("failed")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { brandName: post.id === "good" ? "Cafe A" : "Cafe B", searchQuery: `${post.id === "good" ? "Cafe A" : "Cafe B"} Taipei` })),
    searchPlaces: async place => {
      if (place.placeName === "Cafe B") throw new Error("Places unavailable");
      return [googleCandidate()];
    },
    groundPlace: async () => ({ places: [] })
  }, { concurrency: 2 });
  assert.equal(result.places.find(place => place.id !== "failed")?.googlePlaceId, "google-a");
  assert.match(result.places.find(place => place.placeName === "Cafe B")?.researchFailure || "", /Places unavailable/);
}

{
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => [googleCandidate(), googleCandidate({ id: "google-b", address: "20 Xinyi Rd, Taipei" })],
    groundPlace: async () => ({ places: [] })
  });
  assert.equal(result.places[0].googlePlaceId, "");
  assert.equal(result.places[0].status, "Needs Review");
  assert.equal(result.places[0].googleCandidates.length, 2);
}

{
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => [googleCandidate({ address: "1 Orchard Road, Singapore" })],
    groundPlace: async () => ({ places: [] })
  });
  assert.equal(result.places[0].googlePlaceId, "");
}

{
  let searchCalls = 0;
  const result = await runResearchPipeline([fixturePost("direct-source", { placeName: "Cafe A" })], {
    extractCaptions: async posts => posts.map(post => ({ sourceId: post.id, places: [] })),
    searchPlaces: async () => { searchCalls += 1; return [googleCandidate()]; },
    groundPlace: async () => ({ places: [] })
  });
  assert.equal(searchCalls, 1);
  assert.equal(result.places[0].googlePlaceId, "google-a");
}

{
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { brandName: "東京カフェ", searchQuery: "東京カフェ Taipei" })),
    searchPlaces: async () => [googleCandidate({ name: "京都カフェ" })],
    groundPlace: async () => ({ places: [] })
  });
  assert.equal(result.places[0].googlePlaceId, "");
}

{
  let groundCalls = 0;
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => [googleCandidate({ address: "10 Yongkang St, Taipei, Singapore" })],
    groundPlace: async () => { groundCalls += 1; return { places: [] }; }
  });
  assert.equal(result.places[0].googlePlaceId, "");
  assert.equal(groundCalls, 1);
}

{
  const directCandidate = googleCandidate({ id: "google-review", name: "Cafe B" });
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => [directCandidate],
    groundPlace: async () => ({ places: [] })
  });
  assert.equal(result.places[0].googlePlaceId, "");
  assert.deepEqual((result.places[0].googleCandidates || []).map(candidate => candidate.id), ["google-review"]);
  assert.equal(result.places[0].researchState, "Review");
}

{
  let groundCalls = 0;
  const capError = Object.assign(new Error("Local Places cap reached"), { code: "local_budget_exhausted" });
  const result = await runResearchPipeline([fixturePost("waiting"), fixturePost("capped")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { brandName: post.id, searchQuery: post.id })),
    searchPlaces: async place => place.placeName === "waiting"
      ? await new Promise(resolve => setImmediate(() => resolve([])))
      : await Promise.reject(capError),
    groundPlace: async () => { groundCalls += 1; return { places: [] }; }
  }, { concurrency: 2 });
  assert.equal(groundCalls, 0);
  assert.match(result.places[0].researchFailure, /Local Places cap reached/);
}

{
  const capError = Object.assign(new Error("Local Places cap reached"), { code: "local_budget_exhausted" });
  const result = await runResearchPipeline([fixturePost("valid-completed"), fixturePost("capped-sibling")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, {
      brandName: post.id === "valid-completed" ? "Cafe A" : "Cafe B",
      searchQuery: post.id === "valid-completed" ? "Cafe A Taipei" : "Cafe B Taipei"
    })),
    searchPlaces: async place => place.placeName === "Cafe A"
      ? await new Promise(resolve => setImmediate(() => resolve([googleCandidate()])))
      : await Promise.reject(capError),
    groundPlace: async () => ({ places: [] })
  }, { concurrency: 2 });
  assert.equal(result.places[0].googlePlaceId, "google-a");
  assert.equal(result.places[0].researchState, "Ready");
  assert.equal(result.summary.hardCapReached, true);
}

{
  let searchCalls = 0;
  const capError = Object.assign(new Error("Local grounding cap reached"), { code: "local_budget_exhausted" });
  const result = await runResearchPipeline([fixturePost("grounded-waiting"), fixturePost("grounded-capped")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { brandName: post.id, searchQuery: post.id })),
    searchPlaces: async () => { searchCalls += 1; return []; },
    groundPlace: async place => place.placeName === "grounded-waiting"
      ? await new Promise(resolve => setImmediate(() => resolve({ places: [{ brandName: "Refined Cafe", category: "Cafe", city: "Taipei", country: "Taiwan", confidence: 0.8, evidence: "Guide", searchQuery: "Refined Cafe", requiresVisualAccess: false, sources: [] }] })))
      : await Promise.reject(capError)
  }, { concurrency: 2 });
  assert.equal(searchCalls, 2);
  assert.equal(result.places[0].placeName, "Refined Cafe");
  assert.match(result.places[0].researchFailure, /Local grounding cap reached/);
}

{
  let groundCalls = 0;
  const result = await runResearchPipeline([fixturePost()], {
    googlePlacesAvailable: false,
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => { throw new Error("must not search"); },
    groundPlace: async () => { groundCalls += 1; return { places: [] }; }
  });
  assert.equal(groundCalls, 0);
  assert.equal(result.places[0].researchState, "Review");
  assert.match(result.places[0].researchFailure, /Google Places.*unavailable/i);
}

{
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => [],
    groundPlace: async () => ({ places: [
      { brandName: "Cafe A Screen", category: "Cafe", city: "Taipei", country: "Taiwan", confidence: 0.7, evidence: "Sign only", searchQuery: "Cafe A Screen", requiresVisualAccess: true, sources: [] },
      { brandName: "Cafe A Public", category: "Cafe", city: "Taipei", country: "Taiwan", confidence: 0.8, evidence: "Public listing", searchQuery: "Cafe A Public", requiresVisualAccess: false, sources: [{ title: "Guide", url: "https://example.com/guide" }] }
    ] })
  });
  assert.equal(result.places[0].googleCandidates, undefined);
  assert.equal(result.places[0].groundedCandidates.length, 2);
  assert.equal(result.places[0].geminiRequiresMedia, true);
}

{
  let searchCalls = 0;
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => { searchCalls += 1; return []; },
    groundPlace: async () => ({ places: [
      { brandName: "Cafe A Sign", category: "Cafe", city: "Taipei", country: "Taiwan", confidence: 0.7, evidence: "Name is only on the sign", searchQuery: "Cafe A Sign", requiresVisualAccess: true, sources: [] }
    ] })
  });
  assert.equal(searchCalls, 1);
  assert.equal(result.places[0].groundedCandidates.length, 1);
  assert.equal(result.places[0].researchState, "Visual access required");
}

{
  let searchCalls = 0;
  const result = await runResearchPipeline([fixturePost()], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => {
      searchCalls += 1;
      if (searchCalls === 1) return [];
      throw new Error("Final verification unavailable");
    },
    groundPlace: async () => ({ places: [{ brandName: "Grounded Cafe", category: "Cafe", address: "8 Lane", city: "Taipei", country: "Taiwan", confidence: 0.88, evidence: "Official site", searchQuery: "Grounded Cafe Taipei", requiresVisualAccess: false, sources: [{ title: "Official", url: "https://example.com" }] }] })
  });
  assert.equal(result.places[0].placeName, "Grounded Cafe");
  assert.equal(result.places[0].groundedSources[0].title, "Official");
  assert.match(result.places[0].researchFailure, /Final verification unavailable/);
}

{
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /if \(researchFailures\) notify\([\s\S]*?else notify\(`/);
}

{
  let searchCalls = 0;
  const capError = Object.assign(new Error("Local Places cap reached"), { code: "local_budget_exhausted" });
  const result = await runResearchPipeline([fixturePost("capped"), fixturePost("queued")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => { searchCalls += 1; throw capError; },
    groundPlace: async () => ({ places: [] })
  }, { concurrency: 1 });
  assert.equal(searchCalls, 1);
  assert.equal(result.summary.hardCapReached, true);
  assert.match(result.places[1].researchFailure, /Local Places cap reached/);
}

{
  let extractCalls = 0;
  const capError = Object.assign(new Error("Local Gemini cap reached"), { code: "local_budget_exhausted" });
  const result = await runResearchPipeline([fixturePost("caption-capped"), fixturePost("caption-queued")], {
    extractCaptions: async () => { extractCalls += 1; throw capError; },
    searchPlaces: async () => [],
    groundPlace: async () => ({ places: [] })
  }, { captionBatchSize: 1, concurrency: 1 });
  assert.equal(extractCalls, 1);
  assert.equal(result.summary.hardCapReached, true);
  assert.match(result.places[1].researchFailure, /Local Gemini cap reached/);
}

{
  let searchCalls = 0;
  const result = await runResearchPipeline([fixturePost("weak-caption")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { confidence: 0.79 })),
    searchPlaces: async () => { searchCalls += 1; return [googleCandidate()]; },
    groundPlace: async () => ({ places: [] })
  });
  assert.equal(searchCalls, 0);
  assert.equal(result.places[0].researchState, "Unresolved");
  assert.equal(result.places[0].googlePlaceId, "");
}

{
  let searchCalls = 0;
  const result = await runResearchPipeline([fixturePost("weak-grounded")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id)),
    searchPlaces: async () => { searchCalls += 1; return searchCalls === 1 ? [] : [googleCandidate({ name: "Weak Cafe" })]; },
    groundPlace: async () => ({ places: [{ brandName: "Weak Cafe", category: "Cafe", city: "Taipei", country: "Taiwan", confidence: 0.79, evidence: "Uncertain", searchQuery: "Weak Cafe Taipei", requiresVisualAccess: false, sources: [] }] })
  });
  assert.equal(searchCalls, 1);
  assert.equal(result.places[0].researchState, "Unresolved");
  assert.equal(result.places[0].googlePlaceId, "");
}

{
  let searchCalls = 0;
  let groundCalls = 0;
  const capError = Object.assign(new Error("Local Gemini grounding cap reached"), { code: "local_budget_exhausted", operation: "groundedGemini" });
  const result = await runResearchPipeline([fixturePost("ground-cap"), fixturePost("direct-after-cap")], {
    extractCaptions: async posts => posts.map(post => extracted(post.id, { brandName: post.id === "direct-after-cap" ? "Cafe A" : post.id, searchQuery: post.id })),
    searchPlaces: async place => { searchCalls += 1; return place.placeName === "Cafe A" ? [googleCandidate()] : []; },
    groundPlace: async () => { groundCalls += 1; throw capError; }
  }, { concurrency: 1 });
  assert.equal(groundCalls, 1);
  assert.equal(searchCalls, 2);
  assert.equal(result.places[1].googlePlaceId, "google-a");
}

console.log("Research pipeline tests passed.");
