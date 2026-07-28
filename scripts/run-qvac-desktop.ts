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

// One straightforward non-restricted case and one restricted case. The
// restricted case is the important one: it must produce zero cloud calls
// regardless of what the model recommends.
const CASE_IDS = ["login-lockout", "restricted-cloud-request"];

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

async function main(): Promise<void> {
  const cases = JSON.parse(
    await readFile(join(root, "sample-data/incidents.json"), "utf8"),
  ) as IncidentCase[];

  const selected = CASE_IDS.map((id) => {
    const found = cases.find((c) => c.id === id);
    if (!found) throw new Error(`Fixture case not found: ${id}`);
    return found;
  });

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

    console.log("schemaValid:", record.evaluation?.schemaValid);
    console.log("passed:     ", record.evaluation?.passed);
    console.log("route:      ", record.policy?.allowedRoute);
    console.log("cloudCalls: ", record.policy?.cloudCallCount);
    console.log("raw:        ", JSON.stringify(record.generation?.rawOutput ?? "").slice(0, 200));
    if (record.error) console.log("ERROR:", JSON.stringify(record.error));
    records.push(record);
  }

  const unloaded = await adapter.unload();
  console.log(`\nunload succeeded: ${unloaded}`);

  const outPath = join(
    root,
    `outputs/qvac-desktop-macos-${new Date().toISOString().slice(0, 10)}-001.json`,
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
