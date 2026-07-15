export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const supportedMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm"
]);

export function validateMediaMetadata(value) {
  const mimeType = clean(value?.mimeType).split(";", 1)[0].toLowerCase();
  const size = Number(value?.size);
  if (!supportedMediaTypes.has(mimeType)) {
    throw validationError("Choose an MP4, MOV, WebM, JPEG, PNG, or WebP file", 415);
  }
  if (!Number.isSafeInteger(size) || size < 1) {
    throw validationError("The selected media file is empty or has an invalid size", 400);
  }
  if (size > MAX_MEDIA_BYTES) {
    throw validationError("Choose a media file that is 50 MB or smaller", 413);
  }
  const fileName = clean(value?.fileName).replaceAll("\\", "/").split("/").pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160) || "instagram-media";
  return { fileName, mimeType, size };
}

function validationError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clean(value) {
  return String(value ?? "").trim();
}
