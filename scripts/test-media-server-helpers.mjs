import { geminiFileResource, readBoundedBody, scheduleGeminiFileCleanup } from "../lib/media-server.mjs";

const body = await readBoundedBody(chunks("hello", " ", "world"), 11, 20);
assertEqual(body.toString("utf8"), "hello world", "reads bounded binary body");

await assertRejects(
  () => readBoundedBody(chunks("12345", "67890"), 10, 8),
  "50 MB or smaller",
  "rejects body over configured limit"
);
await assertRejects(
  () => readBoundedBody(chunks("short"), 10, 20),
  "did not match its declared size",
  "rejects incomplete upload"
);

assertEqual(geminiFileResource("files/AbC_123-test"), "files/AbC_123-test", "accepts Gemini file resource");
assertThrows(() => geminiFileResource("https://example.com/files/abc"), "Invalid Gemini file reference", "rejects arbitrary URL");
assertThrows(() => geminiFileResource("files/abc/../../models/key"), "Invalid Gemini file reference", "rejects nested resource path");

let scheduledCallback;
let scheduledDelay;
let unrefCalled = false;
let deletedName = "";
scheduleGeminiFileCleanup(
  "files/cleanup-test",
  async name => { deletedName = name; },
  (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return { unref() { unrefCalled = true; } };
  }
);
assertEqual(scheduledDelay, 300000, "schedules five-minute cleanup");
assertEqual(unrefCalled, true, "cleanup timer does not keep server alive");
await scheduledCallback();
assertEqual(deletedName, "files/cleanup-test", "scheduled cleanup deletes uploaded file");
console.log("Media server helper tests passed.");

async function* chunks(...values) {
  for (const value of values) yield Buffer.from(value);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertThrows(callback, expected, label) {
  try { callback(); } catch (error) {
    if (String(error.message).includes(expected)) return;
    throw new Error(`${label}: expected ${expected}, got ${error.message}`);
  }
  throw new Error(`${label}: expected function to throw`);
}

async function assertRejects(callback, expected, label) {
  try { await callback(); } catch (error) {
    if (String(error.message).includes(expected)) return;
    throw new Error(`${label}: expected ${expected}, got ${error.message}`);
  }
  throw new Error(`${label}: expected promise to reject`);
}
