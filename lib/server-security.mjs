const publicStaticPaths = new Map([
  ["index.html", "dist/index.html"],
  ["data/vietnam_enriched.json", "data/vietnam_enriched.json"],
  ["your_instagram_activity/saved/saved_collections.json", "your_instagram_activity/saved/saved_collections.json"]
]);

const assetPathPattern = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:css|gif|jpe?g|js|png|svg|webp|woff2?)$/i;

export function isPrivateStaticPath(requestedPath) {
  return normalizedPath(requestedPath).split("/").some(segment => segment.startsWith("."));
}

export function isPublicStaticPath(requestedPath) {
  return Boolean(publicStaticFilePath(requestedPath));
}

export function publicStaticFilePath(requestedPath) {
  const path = normalizedPath(requestedPath);
  if (!path || isPrivateStaticPath(path) || hasUnsafeSegment(path)) return "";
  if (publicStaticPaths.has(path)) return publicStaticPaths.get(path);
  return assetPathPattern.test(path) ? `dist/${path}` : "";
}

export function isAllowedLocalHost(value) {
  const host = String(value ?? "").trim();
  const match = host.match(/^(?:127\.0\.0\.1|localhost)(?::(\d{1,5}))?$/i);
  if (!match) return false;
  return !match[1] || Number(match[1]) <= 65535;
}

export function isAllowedLocalOrigin(value) {
  try {
    const origin = new URL(String(value ?? "").trim());
    return origin.protocol === "http:" && isAllowedLocalHost(origin.host);
  } catch {
    return false;
  }
}

function normalizedPath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function hasUnsafeSegment(path) {
  return path.split("/").some(segment => !segment || segment === "." || segment === "..");
}
