export type StudioView = "import" | "places" | "map" | "export";

export type ResearchState = "Ready" | "Review" | "Visual access required" | "Unresolved";
export type MapState = "Address found" | "Map ready" | "Google verified" | "No address";

export type PlaceStatus =
  | "Parsed"
  | "Enriched"
  | "Needs Review"
  | "Address Ready"
  | "Approved"
  | "Rejected"
  | "Not Mappable"
  | "Visited"
  | "Want to Visit";

export interface Place {
  id: string;
  instagramUrl: string;
  instagramHandle: string;
  caption: string;
  collectionName: string;
  category: string;
  status: PlaceStatus | string;
  placeName: string;
  address: string;
  city: string;
  country: string;
  latitude: number | string;
  longitude: number | string;
  confidence: number;
  matchReason: string;
  notes?: string;
  googlePlaceId: string;
  googleBusinessStatus: string;
  googleMapsUrl: string;
  googleVerifiedAt?: string;
  googleMatchScore?: number | string;
  geminiSearchQuery?: string;
  geminiRequiresMedia?: boolean;
  geminiMediaAnalyzedAt?: string;
  geminiMediaOutcome?: string;
  researchState?: ResearchState;
  researchFailure?: string;
  googleCandidates?: GoogleCandidate[];
  groundedCandidates?: GroundedReviewCandidate[];
  groundedSources?: Array<{ title: string; url: string }>;
  [key: string]: unknown;
}

export interface GoogleCandidate {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
  website: string;
  businessStatus: string;
  type: string;
}

export type UsageWarning = "unconfigured" | "safe" | "warning" | "high" | "critical" | "stopped";

export interface UsageMetric {
  used: number;
  cap: number | null;
  percent: number;
  warning: UsageWarning;
}

export interface UsageSection {
  protectionConfigured: boolean;
  requests: UsageMetric;
  tokens?: UsageMetric;
  resetsAt: string;
}

export interface UsageSettings {
  geminiDailyRequestCap: number;
  geminiDailyTokenCap: number;
  geminiGroundingDailyRequestCap: number | null;
  googlePlacesMonthlyRequestCap: number;
}

export interface UsageSnapshot {
  protectionConfigured: boolean;
  settings: UsageSettings;
  gemini: UsageSection;
  geminiGrounding: UsageSection;
  googlePlaces: UsageSection;
  warnings?: string[];
}

export interface ServiceHealth {
  geminiConfigured: boolean;
  googlePlacesConfigured: boolean;
  geminiModel?: string;
}

export interface GeminiPlace {
  brandName: string;
  category: string;
  addressClue: string;
  city: string;
  country: string;
  confidence: number;
  evidence: string;
  searchQuery: string;
  requiresMedia: boolean;
}

export interface GeminiResult {
  sourceId: string;
  places: GeminiPlace[];
}

export interface GroundedReviewCandidate {
  placeName: string;
  category: string;
  address: string;
  city: string;
  country: string;
  confidence: number;
  searchQuery: string;
  requiresVisualAccess: boolean;
  sources: Array<{ title: string; url: string }>;
  evidence: string;
}

export interface GroundedPlace {
  brandName: string;
  category: string;
  city: string;
  country: string;
  address: string;
  searchQuery: string;
  confidence: number | null;
  evidence: string;
  requiresVisualAccess: boolean;
  sources: Array<{ title: string; url: string }>;
}

export interface GroundedResult {
  sourceId: string;
  places: GroundedPlace[];
}

export interface ResearchProgressEvent {
  stage: "caption-extraction" | "places-lookup" | "grounded-research" | "final-verification";
  message: string;
  placeId: string;
}

export interface ResearchSummary {
  total: number;
  googleVerified: number;
  visualAccessRequired: number;
  needsReview: number;
  failed: number;
  hardCapReached: boolean;
}

