import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

function elementStub() {
  return {
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
    click() {},
    closest() { return null; },
    dataset: {},
    focus() {},
    hidden: false,
    innerHTML: "",
    removeAttribute() {},
    setAttribute() {},
    style: {},
    textContent: "",
    value: ""
  };
}

const context = {
  Blob,
  TextDecoder,
  URL,
  URLSearchParams,
  clearTimeout,
  confirm: () => false,
  crypto: webcrypto,
  document: {
    addEventListener() {},
    createElement: elementStub,
    querySelector: elementStub,
    querySelectorAll: () => []
  },
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout,
  window: {}
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "app.js" });

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

const parser = context.window.PinboardAtlas;
const all = parser.parseExport(fixture, "fixture.json");
const taiwan = parser.parseExport(fixture, "fixture.json", "Taiwan");

assertEqual(parser.collectionNamesFromExport(fixture), ["Taiwan", "Food ideas"], "collection names");
assertEqual(all.map(item => item.collectionName), ["Taiwan", "Food ideas"], "cross-collection membership");
assertEqual(taiwan.length, 1, "selected collection count");
assertEqual(taiwan[0].placeName, "L'altier Lotus", "caption venue name");
assertEqual(taiwan[0].address, "Pin: No. 10, Lane 31, Yongkang St, Da'an District", "caption address");
assertEqual(taiwan[0].city, "Taipei", "caption city");
assertEqual(taiwan[0].country, "Taiwan", "caption country");
assertEqual(taiwan[0].latitude, "", "address must await exact coordinates");
assertEqual(taiwan[0].longitude, "", "address must await exact coordinates");
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
const reusedResearch = parser.mergeImportedWithResearch(rawVietnam, researchedVietnam);
assertEqual(reusedResearch.map(item => item.placeName), ["Branch One", "Branch Two", "Venue hidden in this reel"], "research rows expand matching import");
assertEqual(reusedResearch.map(item => item.collectionName), ["Vietnam", "Vietnam", "Vietnam"], "selected collection is preserved");
assertEqual(reusedResearch[2].id, "raw-2", "unmatched import is preserved");
assertEqual(reusedResearch.slice(0, 2).some(item => ["research-1", "research-2"].includes(item.id)), false, "reused rows receive fresh ids");
const replacedWorkspace = parser.mergeWorkspaceItems(
  [
    { id: "old-vietnam", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/OLD/" },
    { id: "keep-taiwan", collectionName: "Taiwan", instagramUrl: "https://instagram.com/reel/KEEP/" }
  ],
  [{ id: "new-vietnam", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/NEW/" }],
  ["Vietnam"]
);
assertEqual(replacedWorkspace.map(item => item.id), ["keep-taiwan", "new-vietnam"], "reimport replaces only selected collections");
const preservedBranches = parser.mergeWorkspaceItems([], [
  { id: "branch-1", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/BRANCHES/", placeName: "Branch One", address: "1 Example Street" },
  { id: "branch-2", collectionName: "Vietnam", instagramUrl: "https://instagram.com/reel/BRANCHES/", placeName: "Branch Two", address: "2 Example Street" }
]);
assertEqual(preservedBranches.map(item => item.id), ["branch-1", "branch-2"], "distinct researched branches are preserved");
assertEqual(parser.markAddressReady({ address: "1 Example Street", status: "Needs Review" }).status, "Address Ready", "failed geocode with researched address is not manual review");
assertEqual(parser.markAddressReady({ address: "", status: "Needs Review" }).status, "Needs Review", "missing address remains manual review");
const cityOnlyFixture = [{ label_values: [
  { label: "Name", value: "Vietnam" },
  { title: "Media", dict: [media("https://www.instagram.com/reel/CITYONLY/", "briareneee", "We likkle but we what?! #saigon")] }
] }];
const cityOnlyItem = parser.parseExport(cityOnlyFixture, "city-only.json", "Vietnam")[0];
assertEqual(cityOnlyItem.city, "Ho Chi Minh City", "city-only caption can retain city context");
assertEqual(cityOnlyItem.latitude, "", "city-only caption must not receive latitude");
assertEqual(cityOnlyItem.longitude, "", "city-only caption must not receive longitude");
const unidentifiedItem = {
  ...cityOnlyItem,
  placeName: "Saigon reggae post",
  matchReason: "Venue is only visible in the reel; caption does not identify it.",
  address: "",
  googleMapsUrl: ""
};
assertEqual(parser.isUnidentifiedPlace(unidentifiedItem), true, "media-only post is explicitly unidentified");
assertEqual(parser.shouldAutoVerifyGoogle(unidentifiedItem), false, "unidentified post is not sent to Places");
assertEqual(parser.buildCsv([unidentifiedItem]).split("\r\n")[1].split(",")[1], '""', "unidentified post exports no Maps link");
assertEqual(parser.shouldAutoVerifyGoogle({ ...unidentifiedItem, placeName: "Aura Clinic - District 1", address: "126 Dinh Tien Hoang, District 1", status: "Address Ready" }), true, "named address is eligible for automatic Places verification");
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
const aiExpanded = parser.expandItemWithGemini(unresolvedItem, [
  { brandName: "Cafe One", category: "Cafe", city: "Taipei", country: "Taiwan", addressClue: "1 First St", confidence: 0.9, evidence: "Caption text" },
  { brandName: "Shop Two", category: "Shopping", city: "Taipei", country: "Taiwan", addressClue: "", confidence: 0.7, evidence: "Caption mention" }
]);
assertEqual(aiExpanded.length, 2, "Gemini can expand one post into multiple venues");
assertEqual(aiExpanded.map(item => item.placeName), ["Cafe One", "Shop Two"], "Gemini venue names");
assertEqual(aiExpanded.map(item => item.instagramUrl), [unresolvedItem.instagramUrl, unresolvedItem.instagramUrl], "Instagram source is preserved");
assertEqual(aiExpanded.map(item => item.collectionName), ["Taiwan", "Taiwan"], "collection is preserved");
assertEqual(aiExpanded.map(item => item.status), ["Needs Review", "Needs Review"], "Gemini output is not map-approved");
assertEqual(aiExpanded.map(item => item.latitude), ["", ""], "Gemini output has no latitude");
assertEqual(parser.expandItemWithGemini(unresolvedItem, [])[0].id, "source-post", "empty Gemini output preserves original item");
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
  instagramUrl: "https://www.instagram.com/p/DYLmCEelKjj/",
  googlePlaceId: "verified-place",
  googleBusinessStatus: "OPERATIONAL",
  googleMapsUrl: "https://maps.google.com/?cid=16663649875436227512",
  notes: "Internal note that must not be exported"
};
const csv = parser.buildCsv([exportItem]);
assertEqual(csv.split("\r\n")[0], '"IG Link","Google Maps","Brand Name","City","Address"', "simplified CSV header");
assertEqual(csv.split("\r\n")[1], `"https://www.instagram.com/p/DYLmCEelKjj/","https://maps.google.com/?cid=16663649875436227512","L'Atelier Lotus","Taipei","No. 10, Lane 31, Yongkang St, Da'an District"`, "simplified CSV row");

const verifiedKml = parser.buildKml([exportItem], "Taiwan", "Food");
assertIncludes(verifiedKml, `Category: Food<br>Address: No. 10, Lane 31, Yongkang St, Da'an District, Taipei, Taiwan<br>Google business status: OPERATIONAL<br><a href="https://maps.google.com/?cid=16663649875436227512">Open in Google Maps</a>`, "verified KML details");
assertExcludes(verifiedKml, "Google Place ID", "KML hides Place ID");
assertExcludes(verifiedKml, "Get directions", "KML hides directions link");
assertExcludes(verifiedKml, "Internal note", "KML hides internal notes");

const unverifiedKml = parser.buildKml([{ ...exportItem, googlePlaceId: "", googleBusinessStatus: "", googleMapsUrl: "" }], "Taiwan", "Food");
assertIncludes(unverifiedKml, "Google business status: NOT VERIFIED", "unverified KML status");
assertIncludes(unverifiedKml, "https://www.google.com/maps/search/?api=1&amp;query=", "unverified KML Maps search link");

console.log("Collection parser tests passed.");

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label}: expected output to include ${JSON.stringify(expected)}`);
}

function assertExcludes(actual, expected, label) {
  if (actual.includes(expected)) throw new Error(`${label}: expected output to exclude ${JSON.stringify(expected)}`);
}
function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
