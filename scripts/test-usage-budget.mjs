import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUsageStore,
  createEmptyUsageLedger,
  normalizeUsageSettings,
  recordUsageResult,
  reserveUsage,
  usageSnapshot,
  warningLevel
} from "../lib/usage-budget.mjs";

const now = new Date("2026-07-15T10:00:00+08:00");
const settings = normalizeUsageSettings({
  geminiDailyRequestCap: 10,
  geminiDailyTokenCap: 1000,
  geminiGroundingDailyRequestCap: 5,
  googlePlacesMonthlyRequestCap: 5
}, { requireAll: true });

assertEqual(warningLevel(6, 10), "safe", "below warning threshold");
assertEqual(warningLevel(7, 10), "warning", "70 percent warning");
assertEqual(warningLevel(9, 10), "high", "85 percent warning");
assertEqual(warningLevel(95, 100), "critical", "95 percent warning");
assertEqual(warningLevel(10, 10), "stopped", "100 percent stop");

assertThrows(() => normalizeUsageSettings({
  geminiDailyRequestCap: 0,
  geminiDailyTokenCap: 1000,
  geminiGroundingDailyRequestCap: 5,
  googlePlacesMonthlyRequestCap: 5
}, { requireAll: true }), "positive integers", "rejects non-positive caps");

let ledger = createEmptyUsageLedger(now);
let reservation = reserveUsage(ledger, settings, "gemini", { requests: 1, estimatedTokens: 100 }, now);
assertEqual(reservation.allowed, true, "allows Gemini below cap");
ledger = reservation.ledger;
ledger = recordUsageResult(ledger, reservation.reservation, {
  success: true,
  usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 20, totalTokenCount: 80 }
}, now);
assertEqual(ledger.gemini.attempts, 1, "records Gemini attempt");
assertEqual(ledger.gemini.successes, 1, "records Gemini success");
assertEqual(ledger.gemini.promptTokens, 60, "records prompt tokens");
assertEqual(ledger.gemini.outputTokens, 20, "records output tokens");
assertEqual(ledger.gemini.totalTokens, 80, "records total tokens");

ledger.googlePlaces.attempts = 5;
const blocked = reserveUsage(ledger, settings, "googlePlaces", { requests: 1 }, now);
assertEqual(blocked.allowed, false, "blocks Places at local cap");
assertEqual(blocked.code, "local_budget_exhausted", "uses structured local stop code");

const snapshot = usageSnapshot(ledger, settings, now);
assertEqual(snapshot.googlePlaces.requests.warning, "stopped", "snapshot reports stopped Places usage");
assertEqual(snapshot.protectionConfigured, true, "all caps configured");
assertEqual("apiKey" in snapshot, false, "snapshot excludes secrets");

const nextDay = new Date("2026-07-16T10:00:00+08:00");
const dailyRolled = usageSnapshot(ledger, settings, nextDay);
assertEqual(dailyRolled.gemini.requests.used, 0, "Gemini rolls daily");
assertEqual(dailyRolled.googlePlaces.requests.used, 5, "Places remains in same month");

const nextMonth = new Date("2026-08-01T10:00:00+08:00");
const monthlyRolled = usageSnapshot(ledger, settings, nextMonth);
assertEqual(monthlyRolled.googlePlaces.requests.used, 0, "Places rolls monthly");

const groundingSettings = {
  geminiDailyRequestCap: 20,
  geminiDailyTokenCap: 100000,
  geminiGroundingDailyRequestCap: 2,
  googlePlacesMonthlyRequestCap: 100
};

const firstGrounding = reserveUsage(createEmptyUsageLedger(now), groundingSettings, "groundedGemini", { requests: 1 }, now);
assertEqual(firstGrounding.allowed, true, "allows first grounded Gemini request");
const secondGrounding = reserveUsage(firstGrounding.ledger, groundingSettings, "groundedGemini", { requests: 1 }, now);
assertEqual(secondGrounding.allowed, true, "allows second grounded Gemini request");
const blockedGrounding = reserveUsage(secondGrounding.ledger, groundingSettings, "groundedGemini", { requests: 1 }, now);
assertEqual(blockedGrounding.allowed, false, "blocks grounded Gemini at local cap");
assertEqual(blockedGrounding.code, "local_budget_exhausted", "uses structured grounded Gemini stop code");
const groundedSnapshot = usageSnapshot(secondGrounding.ledger, groundingSettings, now);
assertEqual(groundedSnapshot.geminiGrounding.requests.used, 2, "snapshot records grounded Gemini requests");
assertEqual(groundedSnapshot.gemini.requests.used, 2, "grounded Gemini requests also consume Gemini requests");

const groundedSuccessLedger = recordUsageResult(secondGrounding.ledger, secondGrounding.reservation, {
  success: true,
  usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, totalTokenCount: 40 }
}, now);
assertEqual(groundedSuccessLedger.geminiGrounding.successes, 1, "records grounded Gemini success");
assertEqual(groundedSuccessLedger.gemini.successes, 1, "grounded success also records Gemini success");
assertEqual(groundedSuccessLedger.gemini.totalTokens, 40, "grounded success records Gemini tokens");

const groundedDailyRolled = usageSnapshot(groundedSuccessLedger, groundingSettings, nextDay);
assertEqual(groundedDailyRolled.geminiGrounding.requests.used, 0, "grounding requests roll daily");
assertEqual(groundedDailyRolled.geminiGrounding.successes, 0, "grounding successes roll daily");

const settingsDirectory = await mkdtemp(join(tmpdir(), "pinboard-usage-settings-"));
try {
  const settingsPath = join(settingsDirectory, "usage-settings.json");
  const ledgerPath = join(settingsDirectory, "usage-ledger.json");
  await writeFile(settingsPath, JSON.stringify({
    geminiDailyRequestCap: 7,
    geminiDailyTokenCap: 700,
    googlePlacesMonthlyRequestCap: 70
  }), "utf8");
  const migratedStore = await createUsageStore({
    settingsPath,
    ledgerPath,
    seedSettings: {
      geminiDailyRequestCap: 20,
      geminiDailyTokenCap: 100000,
      geminiGroundingDailyRequestCap: 100,
      googlePlacesMonthlyRequestCap: 100
    },
    now: () => now
  });
  const migratedSnapshot = await migratedStore.snapshot();
  assertEqual(migratedSnapshot.settings.geminiDailyRequestCap, 7, "migration preserves an explicit existing cap");
  assertEqual(migratedSnapshot.settings.geminiGroundingDailyRequestCap, 100, "migration inherits a newly seeded cap");
} finally {
  await rm(settingsDirectory, { recursive: true, force: true });
}

const usageFlyoutSource = await readFile(new URL("../src/features/usage/usage-flyout.tsx", import.meta.url), "utf8");
assertIncludes(usageFlyoutSource, '["safe", "warning", "high", "critical", "stopped", "unconfigured"]', "unconfigured is the strongest visible usage warning");

console.log("Usage budget tests passed.");

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertThrows(callback, expected, label) {
  try { callback(); }
  catch (error) {
    if (String(error.message).includes(expected)) return;
    throw new Error(`${label}: unexpected error ${error.message}`);
  }
  throw new Error(`${label}: expected an error containing ${JSON.stringify(expected)}`);
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}`);
}
