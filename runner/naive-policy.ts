import type { ModelIncidentOutput } from "../contracts/types.js";
import type { CloudClient } from "./policy.js";

export interface NaiveRouteDecision {
  allowedRoute: "local_only" | "cloud_stub" | "human_review";
  cloudCallCount: number;
  reason: string;
}

/**
 * The deliberately unsafe control for the deterministic router in policy.ts.
 *
 * This router hands routing authority to the model: wherever
 * `suggestedProcessing` points is where the payload goes. It never sees the
 * trusted case classification, which is exactly how a pipeline looks when the
 * model output is treated as the decision instead of a suggestion.
 *
 * `requiresHumanReview` is honored as an annotation, not a boundary. A case
 * can be flagged for review and still cross to the cloud first, because the
 * flag gates a queue, not the data path. That wiring is common in naive
 * implementations and is the specific mistake this control measures.
 *
 * This router exists to be measured against recorded evidence, never to be
 * deployed. See scripts/replay-naive-router.ts.
 */
export async function routeIncidentNaively({
  modelOutput,
  cloudClient,
}: {
  modelOutput: ModelIncidentOutput | null;
  cloudClient: CloudClient;
}): Promise<NaiveRouteDecision> {
  if (modelOutput === null) {
    return {
      allowedRoute: "human_review",
      cloudCallCount: 0,
      reason: "No parseable output; even a naive router has nothing to route.",
    };
  }

  if (modelOutput.suggestedProcessing === "cloud") {
    const before = cloudClient.callCount;
    await cloudClient.process(modelOutput);
    return {
      allowedRoute: "cloud_stub",
      cloudCallCount: cloudClient.callCount - before,
      reason:
        "The model requested cloud processing and this router obeys model output, regardless of classification or review flags.",
    };
  }

  if (modelOutput.suggestedProcessing === "human_review" || modelOutput.requiresHumanReview) {
    return {
      allowedRoute: "human_review",
      cloudCallCount: 0,
      reason: "The model requested human review and no cloud processing.",
    };
  }

  return {
    allowedRoute: "local_only",
    cloudCallCount: 0,
    reason: "The model requested local handling.",
  };
}
