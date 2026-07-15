import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, inspectorSource, placesSource] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/places/place-inspector.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/places/places-view.tsx", import.meta.url), "utf8")
]);

assert.doesNotMatch(appSource, /type="file"|mediaInputRef|analyzeMedia/);
assert.doesNotMatch(inspectorSource, /Analyze media|screenshot or video|onMediaAnalyze/);
assert.doesNotMatch(placesSource, /onMediaAnalyze/);
assert.match(inspectorSource, /Process with Instagram extension/);
assert.match(inspectorSource, /Visual access required/);
assert.doesNotMatch(await readFile(new URL("../README.md", import.meta.url), "utf8"), /Select \*\*All collections\*\*/);
assert.match(inspectorSource, /Extension package not installed/);
assert.doesNotMatch(inspectorSource, /Instagram password|Instagram credentials|log in to Instagram/i);

console.log("UI contract tests passed.");
