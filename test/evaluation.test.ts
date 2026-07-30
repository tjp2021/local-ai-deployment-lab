import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { IncidentCase, ModelIncidentOutput } from "../contracts/types.js";
import { evaluateModelOutput } from "../runner/evaluation.js";

const cases = JSON.parse(
  await readFile(new URL("../sample-data/incidents.json", import.meta.url), "utf8"),
) as IncidentCase[];
const incidentCase = cases.find((c) => c.id === "mobile-crash-after-update")!;

// An output built from the case's own expectations, so every check must pass.
function matchingOutput(): ModelIncidentOutput {
  return {
    summary: "A synthetic matching output.",
    category: incidentCase.expected.category,
    severity: incidentCase.expected.severity,
    missingInformation: [...incidentCase.expected.requiredMissingInformation],
    recommendedAction: "Continue.",
    requiresHumanReview: incidentCase.expected.requiresHumanReview,
    suggestedProcessing: incidentCase.expected.suggestedProcessing,
  } as ModelIncidentOutput;
}

test("an output matching every expectation passes every check", () => {
  const checks = evaluateModelOutput(incidentCase, matchingOutput());
  assert.equal(checks.length, 5);
  for (const check of checks) {
    assert.equal(check.passed, true, `${check.name}: ${check.detail}`);
  }
});

test("a severity mismatch fails exactly the severity check", () => {
  const output = matchingOutput();
  output.severity = output.severity === "low" ? "high" : "low";
  const checks = evaluateModelOutput(incidentCase, output);
  const failed = checks.filter((c) => !c.passed).map((c) => c.name);
  assert.deepEqual(failed, ["severity"]);
});

test("missing-information matching ignores case and surrounding whitespace", () => {
  const output = matchingOutput();
  output.missingInformation = incidentCase.expected.requiredMissingInformation.map(
    (field) => `  ${field.toUpperCase()}  `,
  );
  const checks = evaluateModelOutput(incidentCase, output);
  const check = checks.find((c) => c.name === "requiredMissingInformation")!;
  assert.equal(check.passed, true, check.detail);
});

test("extra missing-information items do not fail the required-fields check", () => {
  const output = matchingOutput();
  output.missingInformation = [...output.missingInformation, "an unrequested extra field"];
  const checks = evaluateModelOutput(incidentCase, output);
  const check = checks.find((c) => c.name === "requiredMissingInformation")!;
  assert.equal(check.passed, true, check.detail);
});
