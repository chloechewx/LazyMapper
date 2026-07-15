import assert from "node:assert/strict";
import { buildGroundingRequest, executeGroundingResearch, parseGroundingResponse } from "../lib/gemini-grounding.mjs";
import { GEMINI_MODEL } from "../lib/runtime-config.mjs";

const request = buildGroundingRequest({
  sourceId: "post-1",
  instagramHandle: "examplecafe",
  placeName: "Example Cafe",
  caption: "New cafe near Yongkang Street",
  city: "Taipei",
  country: "Taiwan"
});

assert.deepEqual(request.tools, [{ google_search: {} }]);
assert.match(request.contents[0].parts[0].text, /Example Cafe/);
assert.match(request.contents[0].parts[0].text, /Do not infer an address without cited evidence/);

const geminiFixture = {
  candidates: [{
    content: {
      parts: [{
        text: `\`\`\`json
${JSON.stringify({
  places: [
    {
      brandName: "Example Cafe",
      confidence: 1.4,
      requiresVisualAccess: true,
      sources: [
        { title: "Invented source", url: "https://hallucinated.example/location" },
        { title: "Model citation", url: "https://example.com/location" }
      ]
    },
    { brandName: "Second Place", confidence: -0.4, requiresVisualAccess: "true" },
    { brandName: "Third Place" },
    { brandName: "Fourth Place", confidence: "unknown" },
    { brandName: "Fifth Place", confidence: true },
    { brandName: "Sixth Place" },
    { brandName: "Seventh Place" },
    { brandName: "Eighth Place" },
    { brandName: "Ninth Place" },
    { brandName: "" }
  ]
})}
\`\`\``
      }]
    },
    groundingMetadata: {
      groundingChunks: [
        { web: { title: "Example location", uri: "https://example.com/location" } },
        { web: { title: "Unsafe location", uri: "javascript:alert(1)" } }
      ]
    }
  }]
};

const parsed = parseGroundingResponse(geminiFixture, "post-1");
assert.throws(() => parseGroundingResponse({
  candidates: [{ content: { parts: [{ text: "{}" }] } }]
}, "post-invalid"), /places array/);
assert.equal(parsed.sourceId, "post-1");
assert.equal(parsed.places[0].brandName, "Example Cafe");
assert.equal(parsed.places[0].sources[0].url, "https://example.com/location");
assert.deepEqual(parsed.places[0].sources.map(source => source.url), ["https://example.com/location"]);
assert.equal(parsed.places.length, 8);
assert.equal(parsed.places[0].confidence, 1);
assert.equal(parsed.places[1].confidence, 0);
assert.equal(parsed.places[2].confidence, null);
assert.equal(parsed.places[3].confidence, null);
assert.equal(parsed.places[4].confidence, null);
assert.equal(parsed.places[0].requiresVisualAccess, true);
assert.equal(parsed.places[1].requiresVisualAccess, false);

const reservations = [];
const requests = [];
const requestUrls = [];
const retried = await executeGroundingResearch({
  place: { sourceId: "post-repair", placeName: "Repair Cafe" },
  model: GEMINI_MODEL,
  apiKey: "test-key",
  reserve: async (_operation, estimate) => {
    reservations.push(estimate);
    return { allowed: true, reservation: { id: reservations.length } };
  },
  record: async reservation => ({ recordedReservation: reservation.id }),
  fetchImpl: async (url, options) => {
    requestUrls.push(url);
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      json: async () => requests.length === 1
        ? { candidates: [{ content: { parts: [{ text: "not json" }] } }] }
        : {
            candidates: [{
              content: { parts: [{ text: JSON.stringify({ places: [{ brandName: "Repair Cafe" }] }) }] },
              groundingMetadata: { groundingChunks: [] }
            }]
          }
    };
  }
});
assert.equal(retried.kind, "success");
assert.equal(reservations.length, 2);
assert.equal(requests.length, 2);
assert.match(requests[1].contents[0].parts[0].text, /Repair instruction/);
assert.equal(requestUrls[0], "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent");

let capReserveCalls = 0;
let capFetchCalls = 0;
const capDenied = await executeGroundingResearch({
  place: { sourceId: "post-cap", placeName: "Cap Cafe" },
  model: GEMINI_MODEL,
  apiKey: "test-key",
  reserve: async () => {
    capReserveCalls += 1;
    return capReserveCalls === 1
      ? { allowed: true, reservation: { id: 1 } }
      : { allowed: false, code: "USAGE_CAP_REACHED" };
  },
  record: async () => ({}),
  fetchImpl: async () => {
    capFetchCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => capFetchCalls === 1
        ? { candidates: [{ content: { parts: [{ text: "not json" }] } }] }
        : { candidates: [{ content: { parts: [{ text: JSON.stringify({ places: [{ brandName: "Must not run" }] }) }] } }] }
    };
  }
});
assert.equal(capDenied.kind, "usage-block");
assert.equal(capReserveCalls, 2);
assert.equal(capFetchCalls, 1);

console.log("Gemini grounding tests passed.");
