export async function readBoundedBody(stream, expectedSize, maxBytes) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) throw requestError("A valid Content-Length header is required", 411);
  if (expectedSize > maxBytes) throw requestError("Choose a media file that is 50 MB or smaller", 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw requestError("Choose a media file that is 50 MB or smaller", 413);
    chunks.push(buffer);
  }
  if (size !== expectedSize) throw requestError("The uploaded media did not match its declared size", 400);
  return Buffer.concat(chunks, size);
}

export function geminiFileResource(value) {
  const name = String(value ?? "").trim();
  if (!/^files\/[A-Za-z0-9_-]+$/.test(name)) throw requestError("Invalid Gemini file reference", 400);
  return name;
}

export function scheduleGeminiFileCleanup(name, deleteFile, schedule = setTimeout) {
  const resource = geminiFileResource(name);
  const timer = schedule(() => Promise.resolve(deleteFile(resource)).catch(() => {}), 5 * 60 * 1000);
  timer?.unref?.();
  return timer;
}
function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
