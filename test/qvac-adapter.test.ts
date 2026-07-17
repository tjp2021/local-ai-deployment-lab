import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CompletionRun } from "@qvac/sdk";
import { QvacAdapter } from "../adapters/qvac/qvac-adapter.js";
import type { IncidentCase } from "../contracts/types.js";
import { validateResult } from "../runner/validation.js";

const cases = JSON.parse(
  await readFile(new URL("../sample-data/incidents.json", import.meta.url), "utf8"),
) as IncidentCase[];

function completionRun(contentText: string): CompletionRun {
  return {
    requestId: "mock-request-1",
    events: (async function* () {})(),
    final: Promise.resolve({
      contentText,
      toolCalls: [],
      stats: {
        timeToFirstToken: 10,
        tokensPerSecond: 50,
        promptTokens: 40,
        generatedTokens: 30,
        backendDevice: "gpu",
      },
      raw: { fullText: contentText },
    }),
    tokenStream: (async function* () {})(),
    toolCallStream: (async function* () {})(),
    text: Promise.resolve(contentText),
    toolCalls: Promise.resolve([]),
    stats: Promise.resolve({
      timeToFirstToken: 10,
      tokensPerSecond: 50,
      promptTokens: 40,
      generatedTokens: 30,
      backendDevice: "gpu",
    }),
  };
}

test("QVAC adapter emits a normalized valid result and forwards native schema constraints", async () => {
  let capturedCompletion: Record<string, unknown> | null = null;
  const client = {
    loadModel: async () => "mock-model",
    completion: (params: Record<string, unknown>) => {
      capturedCompletion = params;
      return completionRun(JSON.stringify({
        summary: "The application closes after launch.",
        category: "technical",
        severity: "high",
        missingInformation: ["device model", "operating system version"],
        recommendedAction: "Collect device details and reproduce locally.",
        requiresHumanReview: false,
        suggestedProcessing: "local",
      }));
    },
    cancel: async () => {},
    unloadModel: async () => {},
  };
  const adapter = new QvacAdapter(client as never);
  await adapter.load("warm");
  const result = await adapter.generate(cases.find((item) => item.id === "mobile-crash-after-update")!, {
    runId: "qvac-mock-run-0001",
    testedAt: "2026-07-17T22:00:00.000Z",
    device: {
      physical: true,
      marketingName: "Fixture Phone",
      osName: "Fixture OS",
      osVersion: "1.0",
    },
    network: { state: "offline", verification: "mechanical" },
    loadClass: "warm",
  });

  const validation = validateResult(result);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal((result as { evaluation: { passed: boolean } }).evaluation.passed, true);
  assert.equal((result as { policy: { cloudCallCount: number } }).policy.cloudCallCount, 0);
  assert.equal(
    ((capturedCompletion as unknown as { responseFormat: { type: string } }).responseFormat.type),
    "json_schema",
  );
  assert.equal(await adapter.unload(), true);
});

test("QVAC adapter preserves invalid raw output and fails closed", async () => {
  const client = {
    loadModel: async () => "mock-model",
    completion: () => completionRun("not valid json"),
    cancel: async () => {},
    unloadModel: async () => {},
  };
  const adapter = new QvacAdapter(client as never);
  await adapter.load("warm");
  const incidentCase = cases.find((item) => item.id === "restricted-cloud-request")!;
  const result = await adapter.generate(incidentCase, {
    runId: "qvac-mock-run-0002",
    testedAt: "2026-07-17T22:00:00.000Z",
    device: {
      physical: true,
      marketingName: "Fixture Phone",
      osName: "Fixture OS",
      osVersion: "1.0",
    },
    network: { state: "offline", verification: "mechanical" },
    loadClass: "warm",
  });

  const normalized = result as {
    generation: { rawOutput: string; parsedOutput: null };
    evaluation: { passed: boolean };
    policy: { allowedRoute: string; cloudCallCount: number };
  };
  assert.equal(validateResult(result).valid, true);
  assert.equal(normalized.generation.rawOutput, "not valid json");
  assert.equal(normalized.generation.parsedOutput, null);
  assert.equal(normalized.evaluation.passed, false);
  assert.equal(normalized.policy.allowedRoute, "human_review");
  assert.equal(normalized.policy.cloudCallCount, 0);
});

