export type DataClassification = "restricted" | "non_restricted";
export type IncidentCategory = "delivery" | "account" | "fraud" | "technical" | "unknown";
export type Severity = "low" | "medium" | "high" | "critical";
export type SuggestedProcessing = "local" | "cloud" | "human_review";

export interface ModelIncidentOutput {
  summary: string;
  category: IncidentCategory;
  severity: Severity;
  missingInformation: string[];
  recommendedAction: string;
  requiresHumanReview: boolean;
  suggestedProcessing: SuggestedProcessing;
}

export interface IncidentCase {
  schemaVersion: "1.0";
  id: string;
  classification: DataClassification;
  incidentText: string;
  expected: {
    category: IncidentCategory;
    severity: Severity;
    requiresHumanReview: boolean;
    suggestedProcessing: SuggestedProcessing;
    requiredMissingInformation: string[];
  };
  tags: Array<
    | "straightforward"
    | "ambiguous"
    | "malformed"
    | "contradictory"
    | "prompt_injection"
    | "restricted"
    | "missing_information"
  >;
}

