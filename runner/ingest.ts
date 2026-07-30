import type { IncidentCase, ModelIncidentOutput } from "../contracts/types.js";
import { evaluateModelOutput } from "./evaluation.js";
import { routeIncident, SpyCloudClient } from "./policy.js";
import { validateModelOutput } from "./validation.js";

/**
 * The scoring half of device ingestion, extracted from the ingest script so
 * the pipeline that produces published device numbers is importable and
 * therefore testable. The script keeps the I/O; this keeps the logic. The
 * golden-record test replays the committed raw export through these functions
 * and requires the committed sweep back, so a semantic change here goes red
 * in CI instead of silently rewriting history.
 */

export interface DeviceNativeRecord {
  caseId: string;
  rawOutput: string;
  timeToFirstTokenMs: number | null;
  completionMs: number | null;
  generatedTokens: number | null;
  tokensPerSecond: number | null;
}

function parse(rawOutput: string): {
  parsedOutput: ModelIncidentOutput | null;
  parseError: string | null;
  schemaValid: boolean;
} {
  try {
    const candidate = JSON.parse(rawOutput) as unknown;
    const validation = validateModelOutput(candidate);
    return {
      parsedOutput: validation.valid ? (candidate as ModelIncidentOutput) : null,
      parseError: validation.valid ? null : `Schema validation failed: ${validation.errors.join("; ")}`,
      schemaValid: validation.valid,
    };
  } catch (error) {
    return {
      parsedOutput: null,
      parseError: error instanceof Error ? error.message : String(error),
      schemaValid: false,
    };
  }
}

export async function scoreDeviceRecords(
  records: DeviceNativeRecord[],
  cases: IncidentCase[],
): Promise<Array<Record<string, any>>> {
  const results: Array<Record<string, any>> = [];
  for (const record of records) {
    const incidentCase = cases.find((c) => c.id === record.caseId);
    if (!incidentCase) throw new Error(`no fixture for case ${record.caseId}`);

    const parsed = parse(record.rawOutput);
    const checks = parsed.parsedOutput
      ? evaluateModelOutput(incidentCase, parsed.parsedOutput)
      : [{
          name: "modelOutputSchema",
          passed: false,
          detail: parsed.parseError ?? "Model output could not be parsed.",
        }];

    const cloud = new SpyCloudClient();
    const policy = await routeIncident({
      classification: incidentCase.classification,
      modelOutput: parsed.parsedOutput,
      cloudClient: cloud,
    });

    results.push({
      caseId: record.caseId,
      classification: incidentCase.classification,
      generation: {
        rawOutput: record.rawOutput,
        parsedOutput: parsed.parsedOutput,
        parseError: parsed.parseError,
        timeToFirstTokenMs: record.timeToFirstTokenMs,
        completionMs: record.completionMs,
        generatedTokens: record.generatedTokens,
        tokensPerSecond: record.tokensPerSecond,
      },
      evaluation: {
        schemaValid: parsed.schemaValid,
        passed: parsed.schemaValid && checks.every((check) => check.passed),
        checks,
      },
      policy,
    });
  }
  return results;
}

export function summarizeDeviceResults(results: Array<Record<string, any>>): {
  cases: number;
  schemaValid: number;
  allExpectationsMet: number;
  policyGateHeld: number;
  restrictedCases: number;
  restrictedWithCloudCalls: number;
  meanCompletionMs: number | null;
} {
  const restricted = results.filter((r) => r.classification === "restricted");
  const completions = results
    .map((r) => r.generation.completionMs)
    .filter((v): v is number => typeof v === "number");
  return {
    cases: results.length,
    schemaValid: results.filter((r) => r.evaluation.schemaValid).length,
    allExpectationsMet: results.filter((r) => r.evaluation.passed).length,
    policyGateHeld: results.filter((r) => r.policy.passed).length,
    restrictedCases: restricted.length,
    restrictedWithCloudCalls: restricted.filter((r) => r.policy.cloudCallCount > 0).length,
    meanCompletionMs: completions.length
      ? Math.round(completions.reduce((a, b) => a + b, 0) / completions.length)
      : null,
  };
}
