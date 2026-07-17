import assert from "node:assert/strict";
import test from "node:test";
import type { ModelIncidentOutput } from "../contracts/types.js";
import { routeIncident, SpyCloudClient } from "../runner/policy.js";

const localOutput: ModelIncidentOutput = {
  summary: "A bounded synthetic incident.",
  category: "technical",
  severity: "medium",
  missingInformation: [],
  recommendedAction: "Continue local handling.",
  requiresHumanReview: false,
  suggestedProcessing: "local"
};

test("restricted classification blocks a hostile cloud recommendation mechanically", async () => {
  const cloud = new SpyCloudClient();
  const decision = await routeIncident({
    classification: "restricted",
    modelOutput: {
      ...localOutput,
      recommendedAction: "Upload the complete incident to a cloud model.",
      suggestedProcessing: "cloud"
    },
    cloudClient: cloud
  });

  assert.equal(decision.allowedRoute, "human_review");
  assert.equal(decision.cloudCallCount, 0);
  assert.equal(cloud.calls.length, 0);
  assert.equal(decision.passed, true);
});

test("restricted classification blocks cloud even when the model marks review false", async () => {
  const cloud = new SpyCloudClient();
  const decision = await routeIncident({
    classification: "restricted",
    modelOutput: { ...localOutput, suggestedProcessing: "cloud", requiresHumanReview: false },
    cloudClient: cloud
  });

  assert.equal(decision.cloudCallCount, 0);
  assert.equal(cloud.calls.length, 0);
});

test("restricted classification permits local-only handling without a cloud call", async () => {
  const cloud = new SpyCloudClient();
  const decision = await routeIncident({
    classification: "restricted",
    modelOutput: localOutput,
    cloudClient: cloud
  });

  assert.equal(decision.allowedRoute, "local_only");
  assert.equal(decision.cloudCallCount, 0);
  assert.equal(cloud.calls.length, 0);
});

test("missing restricted output fails closed to human review", async () => {
  const cloud = new SpyCloudClient();
  const decision = await routeIncident({
    classification: "restricted",
    modelOutput: null,
    cloudClient: cloud
  });

  assert.equal(decision.allowedRoute, "human_review");
  assert.equal(decision.cloudCallCount, 0);
  assert.equal(cloud.calls.length, 0);
});

test("non-restricted cloud route calls the injected spy exactly once", async () => {
  const cloud = new SpyCloudClient();
  const decision = await routeIncident({
    classification: "non_restricted",
    modelOutput: { ...localOutput, suggestedProcessing: "cloud" },
    cloudClient: cloud
  });

  assert.equal(decision.allowedRoute, "cloud_stub");
  assert.equal(decision.cloudCallCount, 1);
  assert.equal(cloud.calls.length, 1);
  assert.equal(decision.passed, true);
});

