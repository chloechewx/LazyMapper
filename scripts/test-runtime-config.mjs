import { GEMINI_MODEL } from "../lib/runtime-config.mjs";

if (GEMINI_MODEL !== "gemini-2.5-flash-lite") {
  throw new Error(`fixed Gemini model: expected "gemini-2.5-flash-lite", got ${JSON.stringify(GEMINI_MODEL)}`);
}

console.log("Runtime config tests passed.");
