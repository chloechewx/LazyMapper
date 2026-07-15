import { buildGeminiMediaRequest } from "../lib/gemini-extraction.mjs";
import { MAX_MEDIA_BYTES, validateMediaMetadata } from "../lib/media-analysis.mjs";

const video = validateMediaMetadata({
  fileName: "C:\\fakepath\\taipei-reel.mp4",
  mimeType: "video/mp4; codecs=avc1",
  size: 8_000_000
});

assertEqual(video, {
  fileName: "taipei-reel.mp4",
  mimeType: "video/mp4",
  size: 8_000_000
}, "normalizes supported video metadata");

const image = validateMediaMetadata({ fileName: "place.png", mimeType: "image/png", size: MAX_MEDIA_BYTES });
assertEqual(image.mimeType, "image/png", "accepts image at size limit");

assertThrows(
  () => validateMediaMetadata({ fileName: "notes.pdf", mimeType: "application/pdf", size: 10 }),
  "Choose an MP4, MOV, WebM, JPEG, PNG, or WebP file",
  "rejects unsupported media"
);
assertThrows(
  () => validateMediaMetadata({ fileName: "huge.mp4", mimeType: "video/mp4", size: MAX_MEDIA_BYTES + 1 }),
  "50 MB or smaller",
  "rejects oversized media"
);

const request = buildGeminiMediaRequest(
  {
    sourceId: "post-7",
    instagramHandle: "zulasg",
    instagramUrl: "https://www.instagram.com/reel/example/",
    collectionName: "Taiwan",
    caption: "The names are shown in the reel.",
    placeName: "Taipei reel"
  },
  { fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc", mimeType: "video/mp4" }
);

assertEqual(request.contents[0].parts[1], {
  fileData: {
    fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
    mimeType: "video/mp4"
  }
}, "includes Gemini file data");
assertIncludes(request.contents[0].parts[0].text, "on-screen text", "asks for visual OCR evidence");
assertIncludes(request.contents[0].parts[0].text, '"sourceId":"post-7"', "includes source ID");
assertEqual(request.generationConfig.responseMimeType, "application/json", "uses structured JSON response");

console.log("Media analysis tests passed.");

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}`);
}

function assertThrows(callback, expected, label) {
  try {
    callback();
  } catch (error) {
    if (String(error.message).includes(expected)) return;
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(error.message)}`);
  }
  throw new Error(`${label}: expected function to throw`);
}
