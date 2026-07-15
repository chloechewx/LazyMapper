import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGeminiMediaRequest, executeCaptionExtraction, parseGeminiResponse } from "./lib/gemini-extraction.mjs";
import { executeGroundingResearch } from "./lib/gemini-grounding.mjs";
import { MAX_MEDIA_BYTES, validateMediaMetadata } from "./lib/media-analysis.mjs";
import { geminiFileResource, readBoundedBody, scheduleGeminiFileCleanup } from "./lib/media-server.mjs";
import { GEMINI_MODEL } from "./lib/runtime-config.mjs";
import { isAllowedLocalHost, isAllowedLocalOrigin, publicStaticFilePath } from "./lib/server-security.mjs";
import { createUsageStore } from "./lib/usage-budget.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const env = await readEnvironment(resolve(root, ".env"));
const apiKey = process.env.GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || "";
const geminiApiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || "";
const geminiModel = GEMINI_MODEL;
const port = Number(process.env.PORT || env.PORT || 4173);
const usageStore = await createUsageStore({
  ledgerPath: resolve(root, "data", "usage-ledger.json"),
  settingsPath: resolve(root, "data", "usage-settings.json"),
  seedSettings: {
    geminiDailyRequestCap: process.env.GEMINI_DAILY_REQUEST_CAP || env.GEMINI_DAILY_REQUEST_CAP,
    geminiDailyTokenCap: process.env.GEMINI_DAILY_TOKEN_CAP || env.GEMINI_DAILY_TOKEN_CAP,
    geminiGroundingDailyRequestCap: process.env.GEMINI_GROUNDING_DAILY_REQUEST_CAP || env.GEMINI_GROUNDING_DAILY_REQUEST_CAP,
    googlePlacesMonthlyRequestCap: process.env.GOOGLE_PLACES_MONTHLY_REQUEST_CAP || env.GOOGLE_PLACES_MONTHLY_REQUEST_CAP
  }
});

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".kml": "application/vnd.google-earth.kml+xml; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const server = createServer(async (request, response) => {
  try {
    const host = clean(request.headers.host);
    if (!isAllowedLocalHost(host)) return sendJson(response, 421, { error: "Localhost access required" });
    const origin = clean(request.headers.origin);
    if (origin && !isAllowedLocalOrigin(origin)) return sendJson(response, 403, { error: "Cross-origin request blocked" });
    const url = new URL(request.url || "/", `http://${host}`);

    if (url.pathname === "/api/health") {
      return sendJson(response, 200, { googlePlacesConfigured: Boolean(apiKey), geminiConfigured: Boolean(geminiApiKey), geminiModel });
    }

    if (url.pathname === "/api/usage") {
      if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
      return sendJson(response, 200, await usageStore.snapshot());
    }

    if (url.pathname === "/api/usage/settings") {
      if (request.method !== "PUT") return sendJson(response, 405, { error: "Method not allowed" });
      return sendJson(response, 200, await usageStore.updateSettings(await readJsonBody(request)));
    }

    if (url.pathname === "/api/gemini/extract") {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
      if (!geminiApiKey) return sendJson(response, 503, { error: "Gemini is not configured" });
      const body = await readJsonBody(request);
      return extractWithGemini(body, response);
    }

    if (url.pathname === "/api/gemini/ground") {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
      if (!geminiApiKey) return sendJson(response, 503, { error: "Gemini is not configured" });
      return groundWithGemini(await readJsonBody(request), response);
    }

    if (url.pathname === "/api/gemini/media/upload") {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
      if (!geminiApiKey) return sendJson(response, 503, { error: "Gemini is not configured" });
      return uploadMediaToGemini(request, response);
    }

    if (url.pathname === "/api/gemini/media/analyze") {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
      if (!geminiApiKey) return sendJson(response, 503, { error: "Gemini is not configured" });
      const body = await readJsonBody(request);
      return analyzeMediaWithGemini(body, response);
    }
    if (url.pathname === "/api/google-places/search") {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
      if (!apiKey) return sendJson(response, 503, { error: "Google Places is not configured" });
      const body = await readJsonBody(request);
      return searchGooglePlaces(body, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, request.method === "HEAD", response);
  } catch (error) {
    const status = error.statusCode || 500;
    return sendJson(response, status, { error: status === 500 ? "Unexpected server error" : error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Pinboard Atlas running at http://127.0.0.1:${port}/`);
  console.log(`Google Places: ${apiKey ? "configured" : "missing API key"}`);
  console.log(`Gemini: ${geminiApiKey ? `${geminiModel} configured` : "missing API key"}`);
});

async function extractWithGemini(body, response) {
  const posts = Array.isArray(body?.posts) ? body.posts.slice(0, 10) : [];
  const allowedSourceIds = new Set(posts.map(post => clean(post?.sourceId)).filter(Boolean));
  if (!posts.length || !allowedSourceIds.size) return sendJson(response, 400, { error: "At least one post with a sourceId is required" });

  try {
    const outcome = await executeCaptionExtraction({
      posts, model: geminiModel, apiKey: geminiApiKey,
      reserve: usageStore.reserve, record: usageStore.record
    });
    if (outcome.kind === "usage-block") return sendUsageBlock(response, outcome.reservation);
    if (outcome.kind === "unreadable") return sendJson(response, 502, { error: "Gemini returned unreadable caption extraction", usage: outcome.usage });
    if (outcome.kind === "upstream-error") {
      const upstreamMessage = clean(outcome.responseBody?.error?.message);
      const message = outcome.status === 429
        ? "Gemini free-tier quota or rate limit reached. Wait for the quota window to reset, then retry."
        : upstreamMessage || "Gemini request failed";
      return sendJson(response, outcome.status, { error: message });
    }
    return sendJson(response, 200, { ...outcome.result, model: geminiModel });
  } catch (error) {
    if (error.name === "TimeoutError") return sendJson(response, 504, { error: "Gemini took too long to respond. Retry this import in a moment." });
    throw error;
  }
}

async function groundWithGemini(body, response) {
  const place = body?.place || body;
  const sourceId = clean(place?.sourceId).slice(0, 160);
  if (!sourceId) return sendJson(response, 400, { error: "A source record with a sourceId is required" });

  const outcome = await executeGroundingResearch({
    place: { ...place, sourceId },
    model: geminiModel,
    apiKey: geminiApiKey,
    reserve: usageStore.reserve,
    record: usageStore.record
  });
  if (outcome.kind === "usage-block") return sendUsageBlock(response, outcome.reservation);
  if (outcome.kind === "unreadable") {
    return sendJson(response, 502, { error: "Gemini returned unreadable grounded research", usage: outcome.usage });
  }
  if (outcome.kind === "upstream-error") {
    const upstreamMessage = clean(outcome.responseBody?.error?.message);
    const message = outcome.status === 429
      ? "Gemini free-tier quota or rate limit reached. Wait for the quota window to reset, then retry."
      : upstreamMessage || "Gemini grounded research failed";
    return sendJson(response, outcome.status, { error: message });
  }
  return sendJson(response, 200, { result: outcome.result, model: geminiModel, usage: outcome.usage });
}
async function uploadMediaToGemini(request, response) {
  const rawFileName = decodeHeaderValue(request.headers["x-file-name"]);
  const metadata = validateMediaMetadata({
    fileName: rawFileName,
    mimeType: request.headers["content-type"],
    size: Number(request.headers["content-length"])
  });
  const content = await readBoundedBody(request, metadata.size, MAX_MEDIA_BYTES);

  const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(metadata.size),
      "X-Goog-Upload-Header-Content-Type": metadata.mimeType
    },
    body: JSON.stringify({ file: { display_name: metadata.fileName } }),
    signal: AbortSignal.timeout(30000)
  });
  if (!startResponse.ok) return sendGeminiError(startResponse, response, "Gemini could not start the media upload");

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) return sendJson(response, 502, { error: "Gemini did not provide a media upload URL" });

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": metadata.mimeType,
      "Content-Length": String(metadata.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: content,
    signal: AbortSignal.timeout(90000)
  });
  if (!uploadResponse.ok) return sendGeminiError(uploadResponse, response, "Gemini could not upload the media");

  const uploaded = await uploadResponse.json().catch(() => ({}));
  const uploadedName = geminiFileResource(uploaded?.file?.name);
  let file;
  try {
    file = await waitForGeminiFile(uploaded?.file);
  } catch (error) {
    await deleteGeminiFile(uploadedName);
    throw error;
  }
  scheduleGeminiFileCleanup(file.name, deleteGeminiFile);
  return sendJson(response, 200, {
    file: {
      name: file.name,
      fileUri: file.uri,
      mimeType: metadata.mimeType,
      displayName: metadata.fileName
    }
  });
}

async function analyzeMediaWithGemini(body, response) {
  const post = body?.post || {};
  const sourceId = clean(post.sourceId).slice(0, 160);
  if (!sourceId) return sendJson(response, 400, { error: "A source post is required" });

  const name = geminiFileResource(body?.file?.name);
  const mimeType = validateMediaMetadata({
    fileName: body?.file?.displayName || "instagram-media",
    mimeType: body?.file?.mimeType,
    size: 1
  }).mimeType;
  const fileUri = `https://generativelanguage.googleapis.com/v1beta/${name}`;

  const requestPayload = buildGeminiMediaRequest({ ...post, sourceId }, { fileUri, mimeType });
  const usageReservation = await usageStore.reserve("gemini", { requests: 1, estimatedTokens: estimateRequestTokens(requestPayload) });
  if (!usageReservation.allowed) {
    await deleteGeminiFile(name);
    return sendUsageBlock(response, usageReservation);
  }

  try {
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey
      },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(120000)
    });
    if (!geminiResponse.ok) {
      await usageStore.record(usageReservation.reservation, { success: false });
      return sendGeminiError(geminiResponse, response, "Gemini media analysis failed");
    }

    const result = await geminiResponse.json().catch(() => ({}));
    await usageStore.record(usageReservation.reservation, { success: true, usageMetadata: result?.usageMetadata });
    const parsed = parseGeminiResponse(result, new Set([sourceId]));
    if (!parsed.responseValid) return sendJson(response, 502, { error: "Gemini returned an unreadable media analysis. The original place was kept; try the media again." });
    return sendJson(response, 200, {
      ...parsed,
      model: geminiModel
    });
  } catch (error) {
    await usageStore.record(usageReservation.reservation, { success: false });
    throw error;
  } finally {
    await deleteGeminiFile(name);
  }
}

async function waitForGeminiFile(initialFile) {
  const name = geminiFileResource(initialFile?.name);
  let file = initialFile;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = clean(file?.state).toUpperCase();
    if (!state || state === "ACTIVE") return { ...file, name };
    if (state === "FAILED") throw Object.assign(new Error("Gemini could not process this media file"), { statusCode: 422 });
    await delay(1500);
    const fileResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { "x-goog-api-key": geminiApiKey },
      signal: AbortSignal.timeout(15000)
    });
    if (!fileResponse.ok) {
      const error = new Error("Gemini could not check media processing");
      error.statusCode = fileResponse.status;
      throw error;
    }
    file = await fileResponse.json();
  }
  throw Object.assign(new Error("Gemini took too long to process the media. Try a shorter clip or a screenshot."), { statusCode: 504 });
}

async function deleteGeminiFile(name) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileResource(name)}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": geminiApiKey },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    console.warn("Gemini media cleanup failed:", error.message);
  }
}

async function sendGeminiError(upstreamResponse, response, fallback) {
  const result = await upstreamResponse.json().catch(() => ({}));
  const upstreamMessage = clean(result?.error?.message);
  const message = upstreamResponse.status === 429
    ? "Gemini free-tier quota or rate limit reached. Wait for the quota window to reset, then retry."
    : upstreamMessage || fallback;
  return sendJson(response, upstreamResponse.status, { error: message });
}

function decodeHeaderValue(value) {
  try { return decodeURIComponent(clean(value)); }
  catch { return clean(value); }
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}
async function searchGooglePlaces(body, response) {
  const textQuery = clean(body?.textQuery).slice(0, 500);
  if (textQuery.length < 2) return sendJson(response, 400, { error: "A place search query is required" });

  const payload = {
    textQuery,
    maxResultCount: 5,
    languageCode: "en"
  };

  const country = clean(body?.country).toUpperCase();
  const regionCode = { VIETNAM: "VN", VN: "VN", TAIWAN: "TW", TW: "TW" }[country];
  if (regionCode) payload.regionCode = regionCode;

  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    payload.locationBias = {
      circle: { center: { latitude, longitude }, radius: 20000 }
    };
  }

  const usageReservation = await usageStore.reserve("googlePlaces", { requests: 1 });
  if (!usageReservation.allowed) return sendUsageBlock(response, usageReservation);

  let googleResponse;
  try {
    googleResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.googleMapsUri",
        "places.websiteUri",
        "places.businessStatus",
        "places.primaryTypeDisplayName"
      ].join(",")
    },
    body: JSON.stringify(payload)
    });
  } catch (error) {
    await usageStore.record(usageReservation.reservation, { success: false });
    throw error;
  }

  const result = await googleResponse.json().catch(() => ({}));
  await usageStore.record(usageReservation.reservation, { success: googleResponse.ok });
  if (!googleResponse.ok) {
    const message = googleResponse.status === 429 ? "Google Places quota or rate limit reached. Check the key quota in Google Cloud, then retry." : result?.error?.message || "Google Places request failed";
    return sendJson(response, googleResponse.status, { error: message });
  }

  const places = (result.places || []).map(place => ({
    id: clean(place.id),
    name: clean(place.displayName?.text),
    address: clean(place.formattedAddress),
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    googleMapsUrl: clean(place.googleMapsUri),
    website: clean(place.websiteUri),
    businessStatus: clean(place.businessStatus),
    type: clean(place.primaryTypeDisplayName?.text)
  }));

  return sendJson(response, 200, { places });
}

async function serveStatic(pathname, headOnly, response) {
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const publicFilePath = publicStaticFilePath(requestedPath);
  if (!publicFilePath) return sendJson(response, 404, { error: "Not found" });
  const filePath = resolve(root, publicFilePath);
  if (filePath !== root && !filePath.startsWith(root + sep)) return sendJson(response, 403, { error: "Forbidden" });

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(headOnly ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return sendJson(response, 404, { error: "Not found" });
    throw error;
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32768) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

async function readEnvironment(filePath) {
  try {
    const source = await readFile(filePath, "utf8");
    return Object.fromEntries(source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")).map(line => {
      const separator = line.indexOf("=");
      return separator < 0 ? [line, ""] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "")];
    }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function estimateRequestTokens(payload) {
  return Math.max(1, Math.ceil(JSON.stringify(payload).length / 4));
}

function sendUsageBlock(response, reservation) {
  return sendJson(response, 429, {
    code: reservation.code,
    error: reservation.error,
    resetsAt: reservation.resetsAt || "",
    usage: reservation.snapshot
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}


