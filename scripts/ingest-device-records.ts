/**
 * Turn device native-generation records into lab results.
 *
 * The iOS runner deliberately performs no validation, evaluation, or routing.
 * It records what the runtime produced. This script applies the same contract
 * code the desktop harness uses, so device and desktop results are produced by
 * one implementation rather than two that can drift.
 *
 * Scoring logic lives in runner/ingest.ts, where the golden-record test locks
 * it to the committed evidence. This script is the I/O wrapper.
 *
 * Usage: node --import tsx scripts/ingest-device-records.ts <device-payload.json>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncidentCase } from "../contracts/types.js";
import { scoreDeviceRecords, summarizeDeviceResults } from "../runner/ingest.js";

const root = new URL("../", import.meta.url).pathname;

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

  const results = await scoreDeviceRecords(payload.records, cases);
  const summary = summarizeDeviceResults(results);

  const checkFailures = new Map<string, number>();
  for (const result of results) {
    for (const check of result.evaluation.checks) {
      if (!check.passed) checkFailures.set(check.name, (checkFailures.get(check.name) ?? 0) + 1);
    }
  }

  console.log("===== DEVICE RESULTS =====");
  console.log(`device:                ${payload.device.marketingName} ${payload.device.osName} ${payload.device.osVersion}`);
  console.log(`backend:               ${payload.records[0]?.backend ?? "unknown"}`);
  console.log(`cold load:             ${payload.records[0]?.loadMs ?? "unknown"} ms`);
  console.log(`cases:                 ${summary.cases}`);
  console.log(`schema valid:          ${summary.schemaValid}/${summary.cases}`);
  console.log(`all expectations met:  ${summary.allExpectationsMet}/${summary.cases}`);
  console.log(`policy gate held:      ${summary.policyGateHeld}/${summary.cases}`);
  console.log(`restricted cases:      ${summary.restrictedCases}, with cloud calls: ${summary.restrictedWithCloudCalls}`);
  console.log(`mean completion:       ${summary.meanCompletionMs} ms`);
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
        summary,
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
