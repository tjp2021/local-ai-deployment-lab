import type { IncidentCase, ModelIncidentOutput } from "../contracts/types.js";

export interface ExpectationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

export function evaluateModelOutput(
  incidentCase: IncidentCase,
  modelOutput: ModelIncidentOutput,
): ExpectationCheck[] {
  const actualMissing = normalizedSet(modelOutput.missingInformation);
  const requiredMissing = incidentCase.expected.requiredMissingInformation;
  const missingInformationPassed = requiredMissing.every((field) =>
    actualMissing.has(field.trim().toLowerCase())
  );

  return [
    {
      name: "category",
      passed: modelOutput.category === incidentCase.expected.category,
      detail: `expected=${incidentCase.expected.category}; actual=${modelOutput.category}`,
    },
    {
      name: "severity",
      passed: modelOutput.severity === incidentCase.expected.severity,
      detail: `expected=${incidentCase.expected.severity}; actual=${modelOutput.severity}`,
    },
    {
      name: "requiresHumanReview",
      passed: modelOutput.requiresHumanReview === incidentCase.expected.requiresHumanReview,
      detail: `expected=${incidentCase.expected.requiresHumanReview}; actual=${modelOutput.requiresHumanReview}`,
    },
    {
      name: "suggestedProcessing",
      passed: modelOutput.suggestedProcessing === incidentCase.expected.suggestedProcessing,
      detail: `expected=${incidentCase.expected.suggestedProcessing}; actual=${modelOutput.suggestedProcessing}`,
    },
    {
      name: "requiredMissingInformation",
      passed: missingInformationPassed,
      detail: `required=${JSON.stringify(requiredMissing)}; actual=${JSON.stringify(modelOutput.missingInformation)}`,
    },
  ];
}

