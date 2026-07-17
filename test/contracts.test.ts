import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validateCase,
  validateModelOutput,
  validateNativeGeneration,
  validateResult,
} from "../runner/validation.js";

const cases = JSON.parse(
  await readFile(new URL("../sample-data/incidents.json", import.meta.url), "utf8"),
) as unknown[];

test("all synthetic incident fixtures satisfy the versioned case contract", () => {
  assert.equal(cases.length, 18);
  for (const incidentCase of cases) {
    const result = validateCase(incidentCase);
    assert.equal(result.valid, true, result.errors.join("; "));
  }
});

test("case contract rejects an untrusted extra field", () => {
  const invalid = { ...(cases[0] as object), uploadToCloud: true };
  const result = validateCase(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /additional properties/i);
});

test("model-output contract accepts the exact application shape", () => {
  const result = validateModelOutput({
    summary: "The application closes after launch.",
    category: "technical",
    severity: "medium",
    missingInformation: ["application version"],
    recommendedAction: "Collect the application version and request human review if the crash persists.",
    requiresHumanReview: false,
    suggestedProcessing: "local"
  });
  assert.equal(result.valid, true, result.errors.join("; "));
});

test("model-output contract rejects plausible JSON with an unauthorized field", () => {
  const result = validateModelOutput({
    summary: "A restricted incident.",
    category: "fraud",
    severity: "high",
    missingInformation: [],
    recommendedAction: "Send the incident away.",
    requiresHumanReview: false,
    suggestedProcessing: "cloud",
    overrideTrustedClassification: true
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /additional properties/i);
});

test("native-generation boundary rejects missing or invented metrics", () => {
  const valid = validateNativeGeneration({
    schemaVersion: "1.0",
    requestId: "fixture-request",
    rawOutput: "{}",
    timeToFirstTokenMs: null,
    completionMs: 100,
    promptTokens: null,
    generatedTokens: 2,
    tokensPerSecond: 20,
  });
  assert.equal(valid.valid, true, valid.errors.join("; "));

  const invalid = validateNativeGeneration({
    schemaVersion: "1.0",
    requestId: "fixture-request",
    rawOutput: "{}",
    completionMs: 100,
    generatedTokens: 2,
    tokensPerSecond: 20,
    inferredPeakMemoryMb: 999,
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /required|additional properties/i);
});

test("result contract accepts explicit unknown measurements instead of invented values", () => {
  const result = validateResult({
    schemaVersion: "1.0",
    runId: "qvac-fixture-0001",
    caseId: "login-lockout",
    testedAt: "2026-07-17T22:00:00.000Z",
    runtime: {
      name: "fixture",
      version: "0.0.0",
      adapterVersion: "0.1.0",
      model: {
        family: "fixture-model",
        artifactFormat: "fixture",
        quantization: null,
        promptTemplate: "fixture-v1",
        generationParameters: { temperature: 0 }
      }
    },
    device: {
      physical: true,
      marketingName: "Test Device",
      osName: "Test OS",
      osVersion: "1.0",
      backend: null
    },
    network: { state: "unknown", verification: "unverified" },
    lifecycle: { loadClass: "unknown", loadMs: null, unloadSucceeded: null },
    generation: {
      rawOutput: "",
      parsedOutput: null,
      parseError: "fixture",
      timeToFirstTokenMs: null,
      completionMs: null,
      promptTokens: null,
      generatedTokens: null,
      tokensPerSecond: null
    },
    evaluation: { schemaValid: false, passed: false, checks: [] },
    policy: {
      classification: "non_restricted",
      allowedRoute: "human_review",
      cloudCallCount: 0,
      passed: true,
      reason: "Missing output requires human review."
    },
    cancellation: null,
    error: { category: "validation", message: "Fixture output was intentionally absent." }
  });

  assert.equal(result.valid, true, result.errors.join("; "));
});
