/**
 * Turn device native-generation records into lab results.
 *
 * The iOS runner deliberately performs no validation, evaluation, or routing.
 * It records what the runtime produced. This script applies the same contract
 * code the desktop harness uses, so device and desktop results are produced by
 * one implementation rather than two that can drift.
 *
 * Usage: node --import tsx scripts/ingest-device-records.ts <device-payload.json>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncidentCase, ModelIncidentOutput } from "../contracts/types.js";
import { evaluateModelOutput } from "../runner/evaluation.js";
import { routeIncident, SpyCloudClient } from "../runner/policy.js";
import { validateModelOutput } from "../runner/validation.js";

const root = new URL("../", import.meta.url).pathname;

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

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) throw new Error("pass the device payload path");

  const payload = JSON.parse(await readFile(source, "utf8")) as Record<string, any>;
  if (payload.evidenceClass !== "device") {
    throw new Error(`expected evidenceClass "device", got "${payload.evidenceClass}"`);
  }

  const cases = JSON.parse(
    await readFile(join(root, "sample-data/incidents.json"), "utf8"),
  ) as IncidentCase[];

  const results: Array<Record<string, any>> = [];
  for (const record of payload.records) {
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

  const total = results.length;
  const schemaValid = results.filter((r) => r.evaluation.schemaValid).length;
  const passed = results.filter((r) => r.evaluation.passed).length;
  const policyOk = results.filter((r) => r.policy.passed).length;
  const restricted = results.filter((r) => r.classification === "restricted");
  const restrictedCloud = restricted.filter((r) => r.policy.cloudCallCount > 0);

  const checkFailures = new Map<string, number>();
  for (const result of results) {
    for (const check of result.evaluation.checks) {
      if (!check.passed) checkFailures.set(check.name, (checkFailures.get(check.name) ?? 0) + 1);
    }
  }

  const completions = results.map((r) => r.generation.completionMs).filter((v) => typeof v === "number");
  const meanCompletion = completions.length
    ? Math.round(completions.reduce((a, b) => a + b, 0) / completions.length)
    : null;

  console.log("===== DEVICE RESULTS =====");
  console.log(`device:                ${payload.device.marketingName} ${payload.device.osName} ${payload.device.osVersion}`);
  console.log(`backend:               ${payload.records[0]?.backend ?? "unknown"}`);
  console.log(`cold load:             ${payload.records[0]?.loadMs ?? "unknown"} ms`);
  console.log(`cases:                 ${total}`);
  console.log(`schema valid:          ${schemaValid}/${total}`);
  console.log(`all expectations met:  ${passed}/${total}`);
  console.log(`policy gate held:      ${policyOk}/${total}`);
  console.log(`restricted cases:      ${restricted.length}, with cloud calls: ${restrictedCloud.length}`);
  console.log(`mean completion:       ${meanCompletion} ms`);
  console.log("failed checks by name:");
  for (const [name, count] of [...checkFailures].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }

  const out = join(root, `outputs/qvac-device-iphone15pro-${new Date().toISOString().slice(0, 10)}-sweep.json`);
  await writeFile(
    out,
    JSON.stringify(
      {
        evidenceClass: "device",
        device: payload.device,
        runtime: payload.runtime,
        promptTemplate: payload.promptTemplate,
        generationParams: payload.generationParams,
        coldLoadMs: payload.records[0]?.loadMs ?? null,
        backend: payload.records[0]?.backend ?? null,
        summary: {
          cases: total,
          schemaValid,
          allExpectationsMet: passed,
          policyGateHeld: policyOk,
          restrictedCases: restricted.length,
          restrictedWithCloudCalls: restrictedCloud.length,
          meanCompletionMs: meanCompletion,
        },
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nwrote ${out}`);
}

main().catch((error) => {
  console.error("ingest failed:", error);
  process.exitCode = 1;
});
