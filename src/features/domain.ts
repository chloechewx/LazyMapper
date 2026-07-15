import * as domainModule from "@/lib/domain.js";
import type { GeminiPlace, MapState, Place, ResearchState } from "@/types";

interface DomainModule {
  parseExport: (json: unknown, fileName: string, collectionName?: string) => Place[];
  collectionNamesFromExport: (json: unknown) => string[];
  expandItemWithGemini: (item: Place, places: GeminiPlace[]) => Place[];
  buildCsv: (items: Place[]) => string;
  buildKml: (items: Place[], collectionLabel?: string, categoryLabel?: string) => string;
  isMappable?: (item: Place) => boolean;
  isCoordinatePair?: (item: { latitude?: unknown; longitude?: unknown }) => boolean;
  mapsUrl?: (item: Place) => string;
  normalizePlace: (item: unknown) => Place;
  researchState: (item: Place) => ResearchState;
  mapState: (item: Place) => MapState;
  coordinatesApproved: (item: Place) => boolean;
  applyPlacePatch: (item: Place, patch: Partial<Place>) => Place;
  placeNeedsAttention: (item: Place) => boolean;
  attentionReason: (item: Place) => string;
}

const domain = domainModule as unknown as DomainModule;

export const parseExport = domain.parseExport;
export const collectionNamesFromExport = domain.collectionNamesFromExport;
export const expandItemWithGemini = domain.expandItemWithGemini;
export const buildCsv = domain.buildCsv;
export const buildKml = domain.buildKml;
export const normalizePlace = domain.normalizePlace;
export const researchState = domain.researchState;
export const mapState = domain.mapState;
export const coordinatesApproved = domain.coordinatesApproved;
export const applyPlacePatch = domain.applyPlacePatch;
export const placeNeedsAttention = domain.placeNeedsAttention;
export const attentionReason = domain.attentionReason;

export function hasCoordinates(item: Place) {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return item.latitude !== "" && item.longitude !== "" && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function isCoordinatePair(item: { latitude?: unknown; longitude?: unknown }) {
  if (domain.isCoordinatePair) return domain.isCoordinatePair(item);
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return item.latitude !== "" && item.longitude !== "" && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function isMappable(item: Place) {
  if (domain.isMappable) return domain.isMappable(item);
  return ["Approved", "Visited", "Want to Visit"].includes(item.status) && hasCoordinates(item);
}

export function mapsUrl(item: Place) {
  if (domain.mapsUrl) return domain.mapsUrl(item);
  if (item.googleMapsUrl) return item.googleMapsUrl;
  const query = [item.placeName, item.address, item.city, item.country].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

export function googleState(item: Place) {
  if (item.googlePlaceId) return "Verified";
  if (item.googleMatchScore || item.googleBusinessStatus) return "Candidate";
  return "Not checked";
}

export function replaceCollection(existing: Place[], imported: Place[], collectionName: string) {
  if (!collectionName) return [...existing, ...imported];
  return [...existing.filter((item) => item.collectionName !== collectionName), ...imported];
}
