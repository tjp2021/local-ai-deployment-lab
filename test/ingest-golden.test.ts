import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { IncidentCase } from "../contracts/types.js";
import { scoreDeviceRecords, summarizeDeviceResults } from "../runner/ingest.js";

/**
 * Golden-record lock on the device scoring pipeline.
 *
 * Every published device number (schema validity, severity accuracy, the
 * policy-gate count) came from scoring the raw iPhone export through
 * runner/ingest.ts. This test replays that exact input and requires the
 * exact committed output back. A semantic change anywhere in the scoring
 * path, evaluation, validation, or routing, fails here instead of silently
 * rewriting the numbers the docs cite.
 */

const raw = JSON.parse(
  await readFile(new URL("../outputs/qvac-device-iphone15pro-2026-07-28-raw.json", import.meta.url), "utf8"),
) as Record<string, any>;
const committed = JSON.parse(
  await readFile(new URL("../outputs/qvac-device-iphone15pro-2026-07-28-sweep.json", import.meta.url), "utf8"),
) as Record<string, any>;
const cases = JSON.parse(
  await readFile(new URL("../sample-data/incidents.json", import.meta.url), "utf8"),
) as IncidentCase[];

test("re-scoring the committed raw device export reproduces the committed sweep exactly", async () => {
  const results = await scoreDeviceRecords(raw.records, cases);
  assert.deepEqual(results, committed.results);
});

test("the summary the docs cite regenerates from the scored results", async () => {
  const results = await scoreDeviceRecords(raw.records, cases);
  assert.deepEqual(summarizeDeviceResults(results), committed.summary);
});
