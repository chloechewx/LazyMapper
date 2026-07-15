export function removePlace(places, id) {
  const index = places.findIndex((place) => place.id === id);
  if (index < 0) return { places, deleted: null };
  return {
    places: places.filter((_, placeIndex) => placeIndex !== index),
    deleted: { place: places[index], index }
  };
}

export function restorePlace(places, deleted) {
  if (!deleted?.place) return places;
  const next = [...places];
  next.splice(Math.min(Math.max(deleted.index, 0), next.length), 0, deleted.place);
  return next;
}

export function clearPlaces(_places) {
  return [];
}

export function createWorkspaceOperationGuard() {
  let generation = 0;
  return {
    begin() {
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(operation) {
      return operation === generation;
    }
  };
}

export function createKeyedOperationGuard() {
  const generations = new Map();
  let allGeneration = 0;
  return {
    begin(key) {
      const keyGeneration = (generations.get(key) || 0) + 1;
      generations.set(key, keyGeneration);
      return { keyGeneration, allGeneration };
    },
    invalidate(key) {
      generations.set(key, (generations.get(key) || 0) + 1);
    },
    invalidateAll() {
      allGeneration += 1;
    },
    isCurrent(key, operation) {
      return Boolean(operation)
        && operation.allGeneration === allGeneration
        && operation.keyGeneration === generations.get(key);
    }
  };
}

export function migrateStoredPlaces(storage, key, normalizePlace) {
  let normalized;
  try {
    const value = storage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
    if (!records) return [];
    normalized = records.map(normalizePlace);
  } catch {
    return [];
  }
  try {
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // The normalized records remain usable even when storage migration cannot be persisted.
  }
  return normalized;
}

export function selectedPlaceAfterRemoval(remainingPlaces, visibleIds, selectedId, deletedId) {
  const remainingIds = new Set(remainingPlaces.map((place) => place.id));
  if (selectedId !== deletedId && selectedId && remainingIds.has(selectedId) && visibleIds.includes(selectedId)) {
    return selectedId;
  }
  const deletedIndex = visibleIds.indexOf(deletedId);
  const remainingVisibleIds = visibleIds.filter((id) => id !== deletedId && remainingIds.has(id));
  if (!remainingVisibleIds.length) return null;
  return remainingVisibleIds[Math.min(Math.max(deletedIndex, 0), remainingVisibleIds.length - 1)];
}
