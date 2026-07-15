import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearPlaces,
  createKeyedOperationGuard,
  createWorkspaceOperationGuard,
  migrateStoredPlaces,
  removePlace,
  restorePlace,
  selectedPlaceAfterRemoval
} from "../src/lib/workspace-state.js";

const places = [{ id: "a" }, { id: "b" }, { id: "c" }];
const removed = removePlace(places, "b");

assert.deepEqual(removed.places.map((place) => place.id), ["a", "c"]);
assert.deepEqual(removed.deleted, { place: { id: "b" }, index: 1 });
assert.deepEqual(restorePlace(removed.places, removed.deleted).map((place) => place.id), ["a", "b", "c"]);
assert.deepEqual(clearPlaces(places), []);
assert.deepEqual(removePlace(places, "missing"), { places, deleted: null });

const operations = createWorkspaceOperationGuard();
const importOperation = operations.begin();
assert.equal(operations.isCurrent(importOperation), true);
operations.invalidate();
assert.equal(operations.isCurrent(importOperation), false);
assert.equal(operations.isCurrent(operations.begin()), true);

const lookups = createKeyedOperationGuard();
const lookupA = lookups.begin("a");
const lookupB = lookups.begin("b");
const unaffectedWorkspaceOperation = operations.begin();
lookups.invalidate("a");
assert.equal(lookups.isCurrent("a", lookupA), false);
assert.equal(lookups.isCurrent("b", lookupB), true);
assert.equal(operations.isCurrent(unaffectedWorkspaceOperation), true);
lookups.invalidateAll();
assert.equal(lookups.isCurrent("b", lookupB), false);

const storageValues = new Map([["workspace", JSON.stringify([
  { id: "a", placeName: "Cafe A", raw: { source: 1 } },
  { id: "b", placeName: "Cafe B", city: "Taipei" }
])]]);
const fakeStorage = {
  getItem: key => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, value)
};
const migrated = migrateStoredPlaces(fakeStorage, "workspace", value => {
  const { raw: _raw, ...record } = value;
  return { city: "", ...record };
});
assert.deepEqual(migrated.map(place => place.id), ["a", "b"]);
assert.equal(Object.hasOwn(migrated[0], "raw"), false);
assert.deepEqual(JSON.parse(fakeStorage.getItem("workspace")), migrated);
const unknownStorage = new Map([["workspace", JSON.stringify({ settings: { keep: true } })]]);
const unknownAdapter = { getItem: key => unknownStorage.get(key) ?? null, setItem: (key, value) => unknownStorage.set(key, value) };
assert.deepEqual(migrateStoredPlaces(unknownAdapter, "workspace", value => value), []);
assert.equal(unknownAdapter.getItem("workspace"), JSON.stringify({ settings: { keep: true } }));
const quotaOriginal = JSON.stringify([{ id: "quota", placeName: "Still available", raw: { private: true } }]);
const quotaStorage = {
  getItem: () => quotaOriginal,
  setItem: () => { throw new Error("Quota exceeded"); }
};
const quotaMigrated = migrateStoredPlaces(quotaStorage, "workspace", value => {
  const { raw: _raw, ...record } = value;
  return record;
});
assert.deepEqual(quotaMigrated, [{ id: "quota", placeName: "Still available" }]);
assert.equal(quotaStorage.getItem("workspace"), quotaOriginal);

assert.equal(selectedPlaceAfterRemoval(
  [{ id: "a" }, { id: "c" }],
  ["b", "c"],
  "b",
  "b"
), "c");
assert.equal(selectedPlaceAfterRemoval(
  [{ id: "a" }, { id: "c" }],
  ["b"],
  "b",
  "b"
), null);
assert.equal(selectedPlaceAfterRemoval(
  [{ id: "a" }, { id: "c" }],
  ["a", "c"],
  "a",
  "c"
), "a");

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("../src/features/places/place-inspector.tsx", import.meta.url), "utf8");
const importSource = readFileSync(new URL("../src/features/import/import-view.tsx", import.meta.url), "utf8");

assert.match(appSource, /workspaceOperationsRef\.current\.invalidate\(\)/);
assert.match(appSource, /lookupOperationsRef\.current\.invalidate\(id\)/);
assert.match(appSource, /if \(busyAction === `google:\$\{id\}`\) setBusyAction\(""\)/);
assert.match(appSource, /lookupOperationsRef\.current\.invalidateAll\(\)/);
assert.match(appSource, /if \(!workspaceOperationsRef\.current\.isCurrent\(operation\)\) return/);
assert.match(appSource, /setFileInputResetKey\(\(current\) => current \+ 1\)/);
assert.match(appSource, /fileInputResetKey=\{fileInputResetKey\}/);
assert.match(appSource, /const normalized = value\.map\(normalizePlace\);[\s\S]*?JSON\.stringify\(normalized\)/);
assert.match(importSource, /key=\{fileInputResetKey\}/);
assert.match(appSource, /window\.setTimeout\([\s\S]*10_000/);
assert.match(inspectorSource, /Delete place/);
assert.match(importSource, /Clear workspace/);
assert.match(importSource, /records and .*collections/);
assert.match(appSource, /persistPlaces\(next\);[\s\S]*?setPendingImport\(null\)/);
assert.match(appSource, /isCoordinatePair\(candidate\)/);

console.log("Workspace state tests passed.");
