import type { DataClassification, ModelIncidentOutput } from "../contracts/types.js";

export interface CloudClient {
  readonly callCount: number;
  process(payload: ModelIncidentOutput): Promise<{ accepted: boolean }>;
}

export class SpyCloudClient implements CloudClient {
  readonly calls: ModelIncidentOutput[] = [];

  get callCount(): number {
    return this.calls.length;
  }

  async process(payload: ModelIncidentOutput): Promise<{ accepted: boolean }> {
    this.calls.push(payload);
    return { accepted: true };
  }
}

export interface RouteDecision {
  classification: DataClassification;
  allowedRoute: "local_only" | "cloud_stub" | "human_review";
  cloudCallCount: number;
  passed: boolean;
  reason: string;
}

interface RouteInput {
  classification: DataClassification;
  modelOutput: ModelIncidentOutput | null;
  cloudClient: CloudClient;
}

export async function routeIncident({
  classification,
  modelOutput,
  cloudClient,
}: RouteInput): Promise<RouteDecision> {
  const before = cloudClient.callCount;

  if (classification === "restricted") {
    const humanReview =
      modelOutput === null ||
      modelOutput.requiresHumanReview ||
      modelOutput.suggestedProcessing !== "local";

    const after = cloudClient.callCount;
    return {
      classification,
      allowedRoute: humanReview ? "human_review" : "local_only",
      cloudCallCount: after - before,
      passed: after === before,
      reason: humanReview
        ? "Restricted input remains local and requires human review; model output cannot authorize a cloud call."
        : "Restricted input remains local; model output cannot authorize a cloud call.",
    };
  }

  if (modelOutput === null || modelOutput.requiresHumanReview || modelOutput.suggestedProcessing === "human_review") {
    return {
      classification,
      allowedRoute: "human_review",
      cloudCallCount: 0,
      passed: true,
      reason: "The output is missing or requests human review.",
    };
  }

  if (modelOutput.suggestedProcessing === "cloud") {
    await cloudClient.process(modelOutput);
    const after = cloudClient.callCount;
    return {
      classification,
      allowedRoute: "cloud_stub",
      cloudCallCount: after - before,
      passed: after - before === 1,
      reason: "Non-restricted input may use the injected cloud stub when the structured recommendation requests it.",
    };
  }

  return {
    classification,
    allowedRoute: "local_only",
    cloudCallCount: 0,
    passed: true,
    reason: "The structured recommendation remains local.",
  };
}
