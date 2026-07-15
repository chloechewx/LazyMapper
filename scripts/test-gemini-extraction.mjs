import {
  buildGeminiMediaRequest,
  buildGeminiRequest,
  executeCaptionExtraction,
  normalizeGeminiPayload,
  parseGeminiResponse
} from "../lib/gemini-extraction.mjs";

const payload = normalizeGeminiPayload({
  results: [
    {
      sourceId: "post-1",
      places: [
        {
          brandName: "  Shape Nail & Coffee  ",
          category: "Beauty",
          city: "Ho Chi Minh City",
          country: "Vietnam",
          addressClue: "85 Tran Quang Khai, District 1",
          searchQuery: "Shape Nail Coffee District 1",
          confidence: 1.8,
          evidence: "Address is written in the caption.",
          latitude: 10.1,
          longitude: 106.2
        },
        { brandName: "", category: "Food" }
      ]
    },
    {
      sourceId: "post-2",
      places: [{ brandName: "Example", category: "Nightlife", confidence: -1 }]
    },
    { sourceId: "not-requested", places: [{ brandName: "Ignore me" }] }
  ]
}, new Set(["post-1", "post-2"]));

assertEqual(payload, {
  results: [
    {
      sourceId: "post-1",
      places: [{
        brandName: "Shape Nail & Coffee",
        category: "Beauty",
        city: "Ho Chi Minh City",
        country: "Vietnam",
        addressClue: "85 Tran Quang Khai, District 1",
        searchQuery: "Shape Nail Coffee District 1",
        confidence: 1,
        evidence: "Address is written in the caption.",
        requiresMedia: false
      }]
    },
    {
      sourceId: "post-2",
      places: [{
        brandName: "Example",
        category: "Unknown",
        city: "",
        country: "",
        addressClue: "",
        searchQuery: "Example",
        confidence: 0,
        evidence: "",
        requiresMedia: false
      }]
    }
  ]
}, "normalized payload");

const request = buildGeminiRequest([{ sourceId: "post-1", caption: "Cafe at Yongkang Street", instagramHandle: "creator", collectionName: "Taiwan" }]);
assertEqual(request.generationConfig.responseMimeType, "application/json", "JSON response mode");
assertEqual(request.generationConfig.responseSchema.properties.results.type, "ARRAY", "results schema");
assertIncludes(request.contents[0].parts[0].text, '"sourceId":"post-1"', "prompt includes source ID");
assertExcludes(JSON.stringify(request), "GEMINI_API_KEY", "request contains no key material");

const mediaRequest = buildGeminiMediaRequest(
  { sourceId: "post-1", caption: "Taipei shopping reel", instagramHandle: "creator", collectionName: "Taiwan" },
  { fileUri: "https://example.invalid/files/demo", mimeType: "video/mp4" }
);
const mediaText = JSON.stringify(mediaRequest).toLowerCase();
assertExcludes(mediaText, "spoken", "media prompt excludes spoken clues");
assertExcludes(mediaText, "audio", "media prompt excludes audio analysis");
assertIncludes(mediaText, "on-screen text", "media prompt keeps visible text analysis");

const parsed = parseGeminiResponse({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [{ sourceId: "post-1", places: [{ brandName: "Lotus", category: "Cafe" }] }] }) }] } }]
}, new Set(["post-1"]));
assertEqual(parsed.results[0].places[0].brandName, "Lotus", "response text parsing");
assertEqual(parsed.responseValid, true, "marks structured response valid");

const malformed = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "{not-json" }] } }] }, new Set(["post-1"]));
assertEqual(malformed.responseValid, false, "marks malformed response invalid");

const emptyValid = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [{ sourceId: "post-1", places: [] }] }) }] } }] }, new Set(["post-1"]));
assertEqual(emptyValid.responseValid, true, "distinguishes valid empty result");

for (const [label, value] of [
  ["missing results", {}],
  ["non-array results", { results: {} }],
  ["empty results", { results: [] }],
  ["missing source", { results: [{ sourceId: "post-2", places: [] }] }],
  ["duplicate source", { results: [{ sourceId: "post-1", places: [] }, { sourceId: "post-1", places: [] }] }],
  ["extra source", { results: [{ sourceId: "post-1", places: [] }, { sourceId: "post-2", places: [] }] }],
  ["non-array places", { results: [{ sourceId: "post-1", places: {} }] }]
]) {
  const invalid = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }, new Set(["post-1"]));
  assertEqual(invalid.responseValid, false, `rejects structurally invalid response: ${label}`);
}

{
  let attempts = 0;
  const reservations = [];
  const outcome = await executeCaptionExtraction({
    posts: [{ sourceId: "post-1", caption: "Cafe" }],
    model: "gemini-2.5-flash-lite",
    apiKey: "test-key",
    reserve: async operation => {
      reservations.push(operation);
      return { allowed: true, reservation: { operation } };
    },
    record: async () => ({}),
    fetchImpl: async (_url, init) => {
      attempts += 1;
      const prompt = JSON.parse(init.body).contents[0].parts[0].text;
      if (attempts === 2) assertIncludes(prompt, "Repair instruction", "repair retry prompt");
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: attempts === 1 ? "{broken" : JSON.stringify({ results: [{ sourceId: "post-1", places: [] }] }) }] } }] }) };
    }
  });
  assertEqual(outcome.kind, "success", "repairs malformed caption response once");
  assertEqual(attempts, 2, "caption repair attempt count");
  assertEqual(reservations, ["gemini", "gemini"], "each caption attempt reserves usage");
}

{
  let attempts = 0;
  const outcome = await executeCaptionExtraction({
    posts: [{ sourceId: "post-1" }], model: "gemini-2.5-flash-lite", apiKey: "test-key",
    reserve: async () => ({ allowed: true, reservation: {} }), record: async () => ({}),
    fetchImpl: async () => {
      attempts += 1;
      const payload = attempts === 1 ? {} : { results: [{ sourceId: "post-1", places: [] }] };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }) };
    }
  });
  assertEqual(outcome.kind, "success", "repairs structurally invalid caption response once");
  assertEqual(attempts, 2, "structurally invalid caption response retries once");
}

{
  let attempts = 0;
  const outcome = await executeCaptionExtraction({
    posts: [{ sourceId: "post-1" }], model: "gemini-2.5-flash-lite", apiKey: "test-key",
    reserve: async () => ({ allowed: true, reservation: {} }),
    record: async () => ({}),
    fetchImpl: async () => { attempts += 1; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "{broken" }] } }] }) }; }
  });
  assertEqual(outcome.kind, "unreadable", "malformed caption output becomes structured failure");
  assertEqual(attempts, 2, "caption malformed output retries only once");
}

{
  let attempts = 0;
  const outcome = await executeCaptionExtraction({
    posts: [{ sourceId: "post-1" }], model: "gemini-2.5-flash-lite", apiKey: "test-key",
    reserve: async () => ({ allowed: true, reservation: {} }), record: async () => ({}),
    fetchImpl: async () => { attempts += 1; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }) }; }
  });
  assertEqual(outcome.kind, "unreadable", "twice structurally invalid caption output becomes structured failure");
  assertEqual(attempts, 2, "structurally invalid output retries only once");
}

console.log("Gemini extraction tests passed.");

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}`);
}

function assertExcludes(actual, expected, label) {
  if (actual.includes(expected)) throw new Error(`${label}: unexpected ${JSON.stringify(expected)}`);
}
