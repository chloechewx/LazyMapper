import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const domain = await import("../src/lib/domain.js").catch(error => {
  assert.fail(`domain module must load without browser globals: ${error.message}`);
});

const {
  CATEGORIES,
  STATUSES,
  MAPPABLE_STATUSES,
  clean,
  mapsUrl,
  collectionNamesFromExport,
  parseExport,
  mergeImportedWithResearch,
  mergeWorkspaceItems,
  expandItemWithGemini,
  isUnidentifiedPlace,
  shouldAutoVerifyGoogle,
  markAddressReady,
  isCoordinatePair,
  isPlausibleLocation,
  isMappable,
  buildCsv,
  buildKml,
  reviewReason,
  normalizePlace,
  researchState,
  mapState,
  coordinatesApproved,
  applyPlacePatch,
  placeNeedsAttention,
  attentionReason
} = domain;

assert.equal(researchState({ googlePlaceId: "g1", placeName: "Cafe A", address: "10 St" }), "Ready");
assert.equal(researchState({ geminiRequiresMedia: true }), "Visual access required");
assert.equal(researchState({ googleCandidates: [{ id: "a" }, { id: "b" }] }), "Review");
assert.equal(researchState({ placeName: "Saigon", address: "" }), "Unresolved");

assert.equal(mapState({ address: "10 St", latitude: "", longitude: "" }), "Address found");
assert.equal(mapState({ status: "Approved", latitude: 1, longitude: 2 }), "Map ready");
assert.equal(mapState({ googlePlaceId: "g1", latitude: 1, longitude: 2 }), "Google verified");
assert.equal(mapState({ googlePlaceId: "g1", latitude: "", longitude: "" }), "Google verified");
assert.equal(mapState({ address: "", latitude: "", longitude: "" }), "No address");
const verifiedWithoutCoordinates = { googlePlaceId: "g1", latitude: "", longitude: "" };
assert.equal(placeNeedsAttention(verifiedWithoutCoordinates), true);
assert.equal(attentionReason(verifiedWithoutCoordinates), "Google verified the listing, but coordinates are still missing for mapping.");

const legendSource = await readFile(new URL("../src/features/places/status-legend.tsx", import.meta.url), "utf8");
assert.doesNotMatch(legendSource, /verified listing and coordinates/i);
assert.match(legendSource, /Coordinates may still be required for mapping/);

assert.equal(researchState({ researchState: "Ready", googlePlaceId: "" }), "Unresolved");
const verifiedPlace = {
  id: "verified",
  placeName: "Cafe A",
  address: "10 St",
  city: "Taipei",
  country: "Taiwan",
  latitude: 25,
  longitude: 121,
  googlePlaceId: "g1",
  googleMapsUrl: "https://maps.google.com/?cid=1",
  googleBusinessStatus: "OPERATIONAL",
  googleVerifiedAt: "2026-07-15T00:00:00.000Z",
  researchState: "Ready"
};
for (const patch of [
  { placeName: "Cafe B" },
  { address: "11 St" },
  { city: "Taichung" },
  { country: "Japan" },
  { latitude: 26 },
  { longitude: 122 }
]) {
  const edited = applyPlacePatch(verifiedPlace, patch);
  assert.equal(edited.googlePlaceId, "");
  assert.equal(edited.researchState, "Unresolved");
}
const reverified = applyPlacePatch(verifiedPlace, { placeName: "Cafe B", googlePlaceId: "g2", researchState: "Ready" });
assert.equal(reverified.googlePlaceId, "g2");
assert.equal(reverified.researchState, "Ready");

assert.equal(coordinatesApproved({ status: "Approved", latitude: 1, longitude: 2 }), true);
assert.equal(coordinatesApproved({ status: "Needs Review", latitude: 1, longitude: 2 }), false);
const normalizedStoredPlace = normalizePlace({ id: "stored", googleCandidates: null, groundedCandidates: "invalid" });
assert.equal(normalizedStoredPlace.id, "stored");
assert.deepEqual(normalizedStoredPlace.googleCandidates, []);
assert.deepEqual(normalizedStoredPlace.groundedCandidates, []);
const migratedStoredPlace = normalizePlace({ id: "migrated", placeName: "Kept", city: "Taipei", raw: { private: "source json" } });
assert.equal(Object.hasOwn(migratedStoredPlace, "raw"), false);
assert.equal(migratedStoredPlace.placeName, "Kept");
assert.equal(migratedStoredPlace.city, "Taipei");

const media = (url, username, caption) => ({
  dict: [
    { label: "URL", value: url },
    { label: "Username", value: username },
    { label: "Caption", value: caption }
  ]
});

const sharedUrl = "https://www.instagram.com/p/DYLmCEelKjj/";
const fixture = [
  {
    label_values: [
      { label: "Name", value: "Taiwan" },
      {
        title: "Media",
        dict: [media(
          sharedUrl,
          "sonyabiteslife",
          "If you are visiting Taiwan, save this spot!\n@latelier_lotus on Yongkang Street is the one everyone comes for.\n\nL'altier Lotus\nPin: No. 10, Lane 31, Yongkang St, Da'an District\nMRT Dongmen exit 5\n#taipei"
        )]
      }
    ]
  },
  {
    label_values: [
      { label: "Name", value: "Food ideas" },
      { title: "Media", dict: [media(sharedUrl, "sonyabiteslife", "Taiwan food souvenir")] }
    ]
  }
];

assert.deepEqual(CATEGORIES, ["Food", "Cafe", "Bar", "Hotel", "Attraction", "Shopping", "Fashion", "Beauty", "Wellness", "Transport", "Event", "Inspiration", "Unknown"]);
assert.deepEqual(STATUSES, ["Parsed", "Enriched", "Needs Review", "Address Ready", "Approved", "Rejected", "Not Mappable", "Visited", "Want to Visit"]);
assert.deepEqual([...MAPPABLE_STATUSES], ["Approved", "Visited", "Want to Visit"]);
assert.equal(clean("  Cafe One  "), "Cafe One");

const all = parseExport(fixture, "fixture.json");
const taiwan = parseExport(fixture, "fixture.json", "Taiwan");

assert.deepEqual(collectionNamesFromExport(fixture), ["Taiwan", "Food ideas"]);
assert.deepEqual(all.map(item => item.collectionName), ["Taiwan", "Food ideas"]);
assert.equal(taiwan.length, 1);
assert.equal(taiwan[0].placeName, "L'altier Lotus");
assert.equal(taiwan[0].address, "Pin: No. 10, Lane 31, Yongkang St, Da'an District");
assert.equal(taiwan[0].city, "Taipei");
assert.equal(taiwan[0].country, "Taiwan");
assert.equal(taiwan[0].latitude, "");
assert.equal(taiwan[0].longitude, "");
assert.doesNotThrow(() => JSON.stringify(taiwan[0]));
assert.equal(Object.hasOwn(taiwan[0], "raw"), false);

const rawVietnam = [
  {
    id: "raw-1",
    instagramUrl: "https://www.instagram.com/reel/ABC123/?igsh=tracking",
    instagramHandle: "travelcreator",
    caption: "Three shops in Ho Chi Minh City",
    collectionName: "Vietnam",
    placeName: "Three shops"
  },
  {
    id: "raw-2",
    instagramUrl: "https://www.instagram.com/reel/UNMATCHED/",
    instagramHandle: "anothercreator",
    caption: "Venue hidden in this reel",
    collectionName: "Vietnam",
    placeName: "Venue hidden in this reel"
  }
];
const researchedVietnam = [
  {
    id: "research-1",
    instagramUrl: "https://instagram.com/reel/ABC123/",
    collectionName: "Old Vietnam label",
    placeName: "Branch One",
    address: "1 Example Street"
  },
  {
    id: "research-2",
    instagramUrl: "https://www.instagram.com/reel/ABC123/",
    collectionName: "Old Vietnam label",
    placeName: "Branch Two",
    address: "2 Example Street"
  }
];
const reusedResearch = mergeImportedWithResearch(rawVietnam, researchedVietnam);
assert.deepEqual(reusedResearch.map(item => item.placeName), ["Branch One", "Branch Two", "Venue hidden in this reel"]);
assert.deepEqual(reusedResearch.map(item => item.collectionName), ["Vietnam", "Vietnam", "Vietnam"]);
assert.equal(reusedResearch[2].id, "raw-2");
assert.equal(reusedResearch.slice(0, 2).some(item => ["research-1", "research-2"].includes(item.id)), false);

const replacedWorkspace = mergeWorkspaceItems(
  [
    { id: "old-vietnam", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/OLD/" },
    { id: "keep-taiwan", collectionName: "Taiwan", instagramUrl: "https://instagram.com/reel/KEEP/" }
  ],
  [{ id: "new-vietnam", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/NEW/" }],
  ["Vietnam"]
);
assert.deepEqual(replacedWorkspace.map(item => item.id), ["keep-taiwan", "new-vietnam"]);

const preservedBranches = mergeWorkspaceItems([], [
  { id: "branch-1", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/BRANCHES/", placeName: "Branch One", address: "1 Example Street" },
  { id: "branch-2", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/BRANCHES/", placeName: "Branch Two", address: "2 Example Street" }
]);
assert.deepEqual(preservedBranches.map(item => item.id), ["branch-1", "branch-2"]);

assert.equal(markAddressReady({ address: "1 Example Street", status: "Needs Review" }).status, "Address Ready");
assert.equal(markAddressReady({ address: "", status: "Needs Review" }).status, "Needs Review");

const cityOnlyFixture = [{ label_values: [
  { label: "Name", value: "Vietnam" },
  { title: "Media", dict: [media("https://www.instagram.com/reel/CITYONLY/", "briareneee", "We likkle but we what?! #saigon")] }
] }];
const cityOnlyItem = parseExport(cityOnlyFixture, "city-only.json", "Vietnam")[0];
assert.equal(cityOnlyItem.city, "Ho Chi Minh City");
assert.equal(cityOnlyItem.latitude, "");
assert.equal(cityOnlyItem.longitude, "");
assert.equal(mapsUrl(cityOnlyItem), "");

const unidentifiedItem = {
  ...cityOnlyItem,
  placeName: "Saigon reggae post",
  matchReason: "Venue is only visible in the reel; caption does not identify it.",
  address: "",
  googleMapsUrl: ""
};
assert.equal(isUnidentifiedPlace(unidentifiedItem), true);
assert.equal(shouldAutoVerifyGoogle(unidentifiedItem), false);
assert.equal(buildCsv([unidentifiedItem]).split("\r\n")[1].split(",")[1], '""');
const weakUnresolved = { status: "Needs Review", researchState: "Unresolved", placeName: "Maybe Cafe", city: "Taipei", address: "", latitude: "", longitude: "", googlePlaceId: "", googleMapsUrl: "" };
assert.equal(mapsUrl(weakUnresolved), "");
assert.equal(buildCsv([weakUnresolved]).split("\r\n")[1].split(",")[1], '""');
assert.equal(
  shouldAutoVerifyGoogle({ ...unidentifiedItem, placeName: "Aura Clinic - District 1", address: "126 Dinh Tien Hoang, District 1", status: "Address Ready" }),
  true
);

const unresolvedItem = {
  id: "source-post",
  category: "Unknown",
  status: "Needs Review",
  placeName: "Creator Profile",
  address: "",
  city: "",
  country: "",
  latitude: "",
  longitude: "",
  instagramHandle: "creator",
  instagramUrl: "https://www.instagram.com/reel/MULTI/",
  collectionName: "Taiwan",
  caption: "Three places in Taipei",
  matchReason: "profile handle found",
  confidence: 0.3
};
const aiExpanded = expandItemWithGemini(unresolvedItem, [
  { brandName: "Cafe One", category: "Cafe", city: "Taipei", country: "Taiwan", addressClue: "1 First St", confidence: 0.9, evidence: "Caption text" },
  { brandName: "Shop Two", category: "Shopping", city: "Taipei", country: "Taiwan", addressClue: "", confidence: 0.7, evidence: "Caption mention" }
]);
assert.equal(aiExpanded.length, 2);
assert.deepEqual(aiExpanded.map(item => item.placeName), ["Cafe One", "Shop Two"]);
assert.deepEqual(aiExpanded.map(item => item.instagramUrl), [unresolvedItem.instagramUrl, unresolvedItem.instagramUrl]);
assert.deepEqual(aiExpanded.map(item => item.collectionName), ["Taiwan", "Taiwan"]);
assert.deepEqual(aiExpanded.map(item => item.status), ["Needs Review", "Needs Review"]);
assert.deepEqual(aiExpanded.map(item => item.latitude), ["", ""]);
assert.equal(expandItemWithGemini(unresolvedItem, [])[0].id, "source-post");

assert.equal(isCoordinatePair({ latitude: 25.033, longitude: 121.5654 }), true);
assert.equal(isCoordinatePair({ latitude: "", longitude: 121.5654 }), false);
assert.equal(isCoordinatePair({ latitude: 91, longitude: 121.5654 }), false);
assert.equal(isCoordinatePair({ latitude: 25.033, longitude: -181 }), false);
assert.equal(isPlausibleLocation({ latitude: 25.033, longitude: 121.5654, country: "Taiwan" }), true);
assert.equal(isPlausibleLocation({ latitude: 1, longitude: 1, country: "Vietnam" }), false);
assert.equal(isMappable({ status: "Approved", latitude: 25.033, longitude: 121.5654, country: "Taiwan" }), true);
assert.equal(isMappable({ status: "Address Ready", latitude: 25.033, longitude: 121.5654, country: "Taiwan" }), false);

assert.deepEqual(reviewReason(unidentifiedItem), {
  label: "Exact place not identifiable",
  detail: "The source identifies a city or post, but not a reliable physical venue."
});
assert.deepEqual(reviewReason({ ...unresolvedItem, address: "1 First St", status: "Address Ready" }), {
  label: "Google listing not verified",
  detail: "The address is ready for an official Google Place match."
});

const exportItem = {
  id: "export-1",
  category: "Food",
  status: "Approved",
  placeName: "L'Atelier Lotus",
  address: "No. 10, Lane 31, Yongkang St, Da'an District",
  city: "Taipei",
  country: "Taiwan",
  latitude: 25.033,
  longitude: 121.5654,
  instagramUrl: sharedUrl,
  googlePlaceId: "verified-place",
  googleBusinessStatus: "OPERATIONAL",
  googleMapsUrl: "https://maps.google.com/?cid=16663649875436227512",
  notes: "Internal note that must not be exported"
};
const csv = buildCsv([exportItem]);
assert.equal(csv.split("\r\n")[0], '"IG Link","Google Maps","Brand Name","City","Address"');
assert.equal(csv.split("\r\n")[1], `"${sharedUrl}","https://maps.google.com/?cid=16663649875436227512","L'Atelier Lotus","Taipei","No. 10, Lane 31, Yongkang St, Da'an District"`);

const verifiedKml = buildKml([exportItem], "Taiwan", "Food");
assert.match(verifiedKml, /Category: Food<br>Address: No\. 10, Lane 31, Yongkang St, Da'an District, Taipei, Taiwan<br>Google business status: OPERATIONAL<br><a href="https:\/\/maps\.google\.com\/\?cid=16663649875436227512">Open in Google Maps<\/a>/);
assert.doesNotMatch(verifiedKml, /Google Place ID|Get directions|Internal note/);

const unverifiedKml = buildKml([{ ...exportItem, googlePlaceId: "", googleBusinessStatus: "", googleMapsUrl: "" }], "Taiwan", "Food");
assert.match(unverifiedKml, /Google business status: NOT VERIFIED/);
assert.match(unverifiedKml, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/);

console.log("Domain tests passed.");
