import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SETTINGS_FIELDS = [
  "geminiDailyRequestCap",
  "geminiDailyTokenCap",
  "geminiGroundingDailyRequestCap",
  "googlePlacesMonthlyRequestCap"
];

export function normalizeUsageSettings(value = {}, options = {}) {
  const settings = Object.fromEntries(SETTINGS_FIELDS.map(field => [field, positiveInteger(value?.[field])]));
  if (options.requireAll && SETTINGS_FIELDS.some(field => settings[field] === null)) {
    throw validationError("Usage caps must be positive integers");
  }
  return settings;
}

export function createEmptyUsageLedger(now = new Date()) {
  return {
    version: 1,
    gemini: {
      period: dayKey(now),
      attempts: 0,
      successes: 0,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reservedTokens: 0
    },
    geminiGrounding: {
      period: dayKey(now),
      attempts: 0,
      successes: 0
    },
    googlePlaces: {
      period: monthKey(now),
      attempts: 0,
      successes: 0
    }
  };
}

export function warningLevel(used, cap) {
  if (!Number.isFinite(cap) || cap <= 0) return "unconfigured";
  const ratio = Math.max(0, Number(used) || 0) / cap;
  if (ratio >= 1) return "stopped";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.85) return "high";
  if (ratio >= 0.7) return "warning";
  return "safe";
}

export function reserveUsage(currentLedger, rawSettings, operation, estimate = {}, now = new Date()) {
  const settings = normalizeUsageSettings(rawSettings);
  const ledger = rollLedger(currentLedger, now);
  const requests = Math.max(1, positiveInteger(estimate.requests) || 1);
  const isGeminiOperation = operation === "gemini" || operation === "groundedGemini";
  const estimatedTokens = isGeminiOperation ? Math.max(0, Math.ceil(Number(estimate.estimatedTokens) || 0)) : 0;

  if (isGeminiOperation) {
    if (!settings.geminiDailyRequestCap || !settings.geminiDailyTokenCap) return unconfigured("Gemini", ledger);
    if (operation === "groundedGemini" && !settings.geminiGroundingDailyRequestCap) {
      return unconfigured("Gemini grounding", ledger);
    }
    const requestWouldExceed = ledger.gemini.attempts + requests > settings.geminiDailyRequestCap;
    const tokenWouldExceed = ledger.gemini.totalTokens + ledger.gemini.reservedTokens + estimatedTokens > settings.geminiDailyTokenCap;
    if (requestWouldExceed || tokenWouldExceed) return exhausted("Gemini", ledger, nextDay(now));
    if (operation === "groundedGemini" && ledger.geminiGrounding.attempts + requests > settings.geminiGroundingDailyRequestCap) {
      return exhausted("Gemini grounding", ledger, nextDay(now));
    }
    ledger.gemini.attempts += requests;
    ledger.gemini.reservedTokens += estimatedTokens;
    if (operation === "groundedGemini") ledger.geminiGrounding.attempts += requests;
  } else if (operation === "googlePlaces") {
    if (!settings.googlePlacesMonthlyRequestCap) return unconfigured("Google Places", ledger);
    if (ledger.googlePlaces.attempts + requests > settings.googlePlacesMonthlyRequestCap) {
      return exhausted("Google Places", ledger, nextMonth(now));
    }
    ledger.googlePlaces.attempts += requests;
  } else {
    throw validationError(`Unknown usage operation: ${operation}`);
  }

  return {
    allowed: true,
    ledger,
    reservation: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      operation,
      requests,
      estimatedTokens,
      period: isGeminiOperation ? ledger.gemini.period : ledger.googlePlaces.period
    }
  };
}

export function recordUsageResult(currentLedger, reservation, result = {}, now = new Date()) {
  const ledger = rollLedger(currentLedger, now);
  if (!reservation?.operation) return ledger;

  if (reservation.operation === "gemini" || reservation.operation === "groundedGemini") {
    ledger.gemini.reservedTokens = Math.max(0, ledger.gemini.reservedTokens - Math.max(0, Number(reservation.estimatedTokens) || 0));
    if (result.success) ledger.gemini.successes += Math.max(1, Number(reservation.requests) || 1);
    if (reservation.operation === "groundedGemini" && result.success) {
      ledger.geminiGrounding.successes += Math.max(1, Number(reservation.requests) || 1);
    }
    const metadata = result.usageMetadata || {};
    ledger.gemini.promptTokens += nonNegativeInteger(metadata.promptTokenCount);
    ledger.gemini.outputTokens += nonNegativeInteger(metadata.candidatesTokenCount);
    ledger.gemini.totalTokens += nonNegativeInteger(metadata.totalTokenCount);
  } else if (reservation.operation === "googlePlaces" && result.success) {
    ledger.googlePlaces.successes += Math.max(1, Number(reservation.requests) || 1);
  }
  return ledger;
}

export function usageSnapshot(currentLedger, rawSettings, now = new Date()) {
  const ledger = rollLedger(currentLedger, now);
  const settings = normalizeUsageSettings(rawSettings);
  const geminiConfigured = Boolean(settings.geminiDailyRequestCap && settings.geminiDailyTokenCap);
  const groundingConfigured = Boolean(settings.geminiGroundingDailyRequestCap);
  const placesConfigured = Boolean(settings.googlePlacesMonthlyRequestCap);
  return {
    protectionConfigured: geminiConfigured && groundingConfigured && placesConfigured,
    settings,
    gemini: {
      protectionConfigured: geminiConfigured,
      requests: metric(ledger.gemini.attempts, settings.geminiDailyRequestCap),
      tokens: metric(ledger.gemini.totalTokens + ledger.gemini.reservedTokens, settings.geminiDailyTokenCap),
      promptTokens: ledger.gemini.promptTokens,
      outputTokens: ledger.gemini.outputTokens,
      successes: ledger.gemini.successes,
      resetsAt: nextDay(now).toISOString()
    },
    geminiGrounding: {
      protectionConfigured: groundingConfigured,
      requests: metric(ledger.geminiGrounding.attempts, settings.geminiGroundingDailyRequestCap),
      successes: ledger.geminiGrounding.successes,
      resetsAt: nextDay(now).toISOString()
    },
    googlePlaces: {
      protectionConfigured: placesConfigured,
      requests: metric(ledger.googlePlaces.attempts, settings.googlePlacesMonthlyRequestCap),
      successes: ledger.googlePlaces.successes,
      resetsAt: nextMonth(now).toISOString()
    }
  };
}

export async function createUsageStore(options) {
  const now = options.now || (() => new Date());
  const ledgerPath = options.ledgerPath;
  const settingsPath = options.settingsPath;
  const persistedSettings = await readJson(settingsPath, {});
  let settings = normalizeUsageSettings({ ...(options.seedSettings || {}), ...persistedSettings });
  let ledger = normalizeLedger(await readJson(ledgerPath, createEmptyUsageLedger(now())), now());
  let queue = Promise.resolve();

  const transact = callback => {
    const operation = queue.then(callback, callback);
    queue = operation.catch(() => {});
    return operation;
  };

  return Object.freeze({
    snapshot() {
      return transact(async () => {
        ledger = rollLedger(ledger, now());
        await writeJsonAtomic(ledgerPath, ledger);
        return usageSnapshot(ledger, settings, now());
      });
    },
    updateSettings(value) {
      return transact(async () => {
        settings = normalizeUsageSettings(value, { requireAll: true });
        await writeJsonAtomic(settingsPath, settings);
        return usageSnapshot(ledger, settings, now());
      });
    },
    reserve(operation, estimate) {
      return transact(async () => {
        const result = reserveUsage(ledger, settings, operation, estimate, now());
        ledger = result.ledger;
        if (result.allowed) await writeJsonAtomic(ledgerPath, ledger);
        return result.allowed ? { ...result, snapshot: usageSnapshot(ledger, settings, now()) } : { ...result, snapshot: usageSnapshot(ledger, settings, now()) };
      });
    },
    record(reservation, result) {
      return transact(async () => {
        ledger = recordUsageResult(ledger, reservation, result, now());
        await writeJsonAtomic(ledgerPath, ledger);
        return usageSnapshot(ledger, settings, now());
      });
    }
  });
}

function metric(used, cap) {
  const safeUsed = Math.max(0, Number(used) || 0);
  return {
    used: safeUsed,
    cap,
    percent: cap ? Math.min(100, Math.round((safeUsed / cap) * 100)) : 0,
    warning: warningLevel(safeUsed, cap)
  };
}

function rollLedger(value, now) {
  const ledger = normalizeLedger(value, now);
  if (ledger.gemini.period !== dayKey(now)) ledger.gemini = createEmptyUsageLedger(now).gemini;
  if (ledger.geminiGrounding.period !== dayKey(now)) ledger.geminiGrounding = createEmptyUsageLedger(now).geminiGrounding;
  if (ledger.googlePlaces.period !== monthKey(now)) ledger.googlePlaces = createEmptyUsageLedger(now).googlePlaces;
  return ledger;
}

function normalizeLedger(value, now) {
  const empty = createEmptyUsageLedger(now);
  return {
    version: 1,
    gemini: {
      period: String(value?.gemini?.period || empty.gemini.period),
      attempts: nonNegativeInteger(value?.gemini?.attempts),
      successes: nonNegativeInteger(value?.gemini?.successes),
      promptTokens: nonNegativeInteger(value?.gemini?.promptTokens),
      outputTokens: nonNegativeInteger(value?.gemini?.outputTokens),
      totalTokens: nonNegativeInteger(value?.gemini?.totalTokens),
      reservedTokens: nonNegativeInteger(value?.gemini?.reservedTokens)
    },
    geminiGrounding: {
      period: String(value?.geminiGrounding?.period || empty.geminiGrounding.period),
      attempts: nonNegativeInteger(value?.geminiGrounding?.attempts),
      successes: nonNegativeInteger(value?.geminiGrounding?.successes)
    },
    googlePlaces: {
      period: String(value?.googlePlaces?.period || empty.googlePlaces.period),
      attempts: nonNegativeInteger(value?.googlePlaces?.attempts),
      successes: nonNegativeInteger(value?.googlePlaces?.successes)
    }
  };
}

function unconfigured(service, ledger) {
  return {
    allowed: false,
    code: "local_budget_unconfigured",
    error: `${service} protection is not configured. Add positive local caps in Usage settings.`,
    ledger
  };
}

function exhausted(service, ledger, reset) {
  return {
    allowed: false,
    code: "local_budget_exhausted",
    error: `${service} local usage cap reached. It resets ${reset.toLocaleString()}.`,
    resetsAt: reset.toISOString(),
    ledger
  };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function dayKey(date) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function monthKey(date) {
  return [date.getFullYear(), pad(date.getMonth() + 1)].join("-");
}

function nextDay(date) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next;
}

function nextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    if (error instanceof SyntaxError) {
      await rename(filePath, `${filePath}.${Date.now()}.corrupt`).catch(() => {});
      return fallback;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
