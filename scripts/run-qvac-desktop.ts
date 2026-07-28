/**
 * Desktop QVAC proof run.
 *
 * This exists to exercise the QVAC adapter against the real SDK before any
 * physical-device work. The adapter's unit tests inject a fake client, so
 * until this script runs, no QVAC inference has ever executed through the
 * lab contract.
 *
 * This produces DESKTOP evidence only. It is not a physical-device claim and
 * its records must never be published as one. Device records come from a
 * platform runner on real hardware.
 */
import { readFile, writeFile } from "node:fs/promises";
import { totalmem } from "node:os";
import { join } from "node:path";
import { QvacAdapter } from "../adapters/qvac/qvac-adapter.js";
import type { RunContext } from "../runner/adapter.js";
import type { IncidentCase } from "../contracts/types.js";

const root = new URL("../", import.meta.url).pathname;

// Default is a two-case smoke proof: one straightforward non-restricted case
// and one restricted case. The restricted case is the important one, since it
// must produce zero cloud calls regardless of what the model recommends.
//
// Pass --all to sweep the full fixture set. Two hand-picked cases exercise the
// contract but cannot support an accuracy claim.
const SMOKE_CASE_IDS = ["login-lockout", "restricted-cloud-request"];
const sweepAll = process.argv.includes("--all");

function context(runId: string, loadClass: RunContext["loadClass"]): RunContext {
  return {
    runId,
    testedAt: new Date().toISOString(),
    device: {
      physical: true,
      marketingName: "Mac (desktop host)",
      osName: "macOS",
      osVersion: process.env.LAB_HOST_OS_VERSION ?? "unknown",
    },
    network: { state: "online", verification: "user_asserted" },
    loadClass,
  };
}

/**
 * Aggregate case-level results. The lab reports case-level outcomes rather
 * than a single composite score, so this counts what failed and where.
 */
function summarize(records: Array<Record<string, any>>): void {
  const total = records.length;
  const schemaValid = records.filter((r) => r.evaluation?.schemaValid).length;
  const passed = records.filter((r) => r.evaluation?.passed).length;
  const policyOk = records.filter((r) => r.policy?.passed).length;
  const restricted = records.filter((r) => r.policy?.classification === "restricted");
  const restrictedWithCloud = restricted.filter((r) => (r.policy?.cloudCallCount ?? 0) > 0);

  const checkFailures = new Map<string, number>();
  for (const record of records) {
    for (const check of record.evaluation?.checks ?? []) {
      if (!check.passed) checkFailures.set(check.name, (checkFailures.get(check.name) ?? 0) + 1);
    }
  }

  console.log("\n===== SUMMARY =====");
  console.log(`cases:                 ${total}`);
  console.log(`schema valid:          ${schemaValid}/${total}`);
  console.log(`all expectations met:  ${passed}/${total}`);
  console.log(`policy gate held:      ${policyOk}/${total}`);
  console.log(`restricted cases:      ${restricted.length}, with cloud calls: ${restrictedWithCloud.length}`);
  console.log("failed checks by name:");
  for (const [name, count] of [...checkFailures].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
}

async function main(): Promise<void> {
  const cases = JSON.parse(
    await readFile(join(root, "sample-data/incidents.json"), "utf8"),
  ) as IncidentCase[];

  const selected = sweepAll
    ? cases
    : SMOKE_CASE_IDS.map((id) => {
        const found = cases.find((c) => c.id === id);
        if (!found) throw new Error(`Fixture case not found: ${id}`);
        return found;
      });
  console.log(`mode: ${sweepAll ? "full sweep" : "smoke"} (${selected.length} cases)`);

  const adapter = new QvacAdapter();
  console.log("capabilities:", JSON.stringify(adapter.capabilities(), null, 2));

  console.log("\nLoading model through the real QVAC SDK. First run downloads the artifact.");
  const loadStarted = Date.now();
  await adapter.load("cold");
  console.log(`load completed in ${Date.now() - loadStarted} ms`);

  const records: unknown[] = [];
  for (const [index, incidentCase] of selected.entries()) {
    const runId = `qvac-desktop-${new Date().toISOString().slice(0, 10)}-${String(index + 1).padStart(3, "0")}`;
    console.log(`\n--- ${incidentCase.id} (${incidentCase.classification}) ---`);
    const record = await adapter.generate(
      incidentCase,
      context(runId, index === 0 ? "cold" : "warm"),
    ) as Record<string, any>;

    const failed = (record.evaluation?.checks ?? []).filter((c: any) => !c.passed);
    console.log(
      `schemaValid=${record.evaluation?.schemaValid} passed=${record.evaluation?.passed} ` +
      `route=${record.policy?.allowedRoute} cloudCalls=${record.policy?.cloudCallCount} ` +
      `policyOk=${record.policy?.passed}`,
    );
    if (failed.length > 0) {
      console.log("  failed checks: " + failed.map((c: any) => `${c.name} (${c.detail})`).join(", "));
    }
    if (record.error) console.log("  ERROR:", JSON.stringify(record.error));
    records.push(record);
  }

  summarize(records as Array<Record<string, any>>);

  const unloaded = await adapter.unload();
  console.log(`\nunload succeeded: ${unloaded}`);

  const outPath = join(
    root,
    `outputs/qvac-desktop-macos-${new Date().toISOString().slice(0, 10)}-${sweepAll ? "sweep" : "001"}.json`,
  );
  await writeFile(
    outPath,
    JSON.stringify(
      {
        evidenceClass: "desktop",
        note: "Desktop host evidence. Not a physical-device claim.",
        host: { totalMemoryGb: Math.round(totalmem() / 1e9) },
        records,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nwrote ${outPath}`);
}

main().catch((error) => {
  console.error("desktop run failed:", error);
  process.exitCode = 1;
});
