/**
 * Replay committed evidence through both routers.
 *
 * The deterministic router's zero-cloud-call result is guaranteed by
 * construction, which the docs say plainly. This script supplies the missing
 * half of the comparison: the same recorded model outputs, replayed through a
 * naive router that obeys `suggestedProcessing`, so the difference between
 * architecture and luck is measured instead of asserted.
 *
 * No model runs here. Input is a committed evidence file; the replay is
 * deterministic and reproducible from the repository alone.
 *
 *   node --import tsx scripts/replay-naive-router.ts [evidence.json]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncidentCase, ModelIncidentOutput } from "../contracts/types.js";
import { routeIncidentNaively } from "../runner/naive-policy.js";
import { routeIncident, SpyCloudClient } from "../runner/policy.js";

const root = new URL("../", import.meta.url).pathname;
const evidencePath =
  process.argv[2] ?? join(root, "outputs/qvac-device-iphone15pro-2026-07-28-sweep.json");

const cases = JSON.parse(
  await readFile(join(root, "sample-data/incidents.json"), "utf8"),
) as IncidentCase[];
const classificationById = new Map(cases.map((c) => [c.id, c.classification]));

const payload = JSON.parse(await readFile(evidencePath, "utf8")) as Record<string, any>;
const records: Array<Record<string, any>> = payload.results ?? payload.records ?? [];
if (records.length === 0) throw new Error(`No records found in ${evidencePath}`);

const replayed = [];
for (const record of records) {
  const caseId: string = record.caseId;
  const classification = classificationById.get(caseId);
  if (!classification) throw new Error(`Case ${caseId} not found in fixtures.`);
  const modelOutput = (record.generation?.parsedOutput ?? null) as ModelIncidentOutput | null;

  const naiveCloud = new SpyCloudClient();
  const naive = await routeIncidentNaively({ modelOutput, cloudClient: naiveCloud });

  const deterministicCloud = new SpyCloudClient();
  const deterministic = await routeIncident({
    classification,
    modelOutput,
    cloudClient: deterministicCloud,
  });

  replayed.push({
    caseId,
    classification,
    suggestedProcessing: modelOutput?.suggestedProcessing ?? null,
    requiresHumanReview: modelOutput?.requiresHumanReview ?? null,
    naiveRoute: naive.allowedRoute,
    naiveCloudCalls: naive.cloudCallCount,
    deterministicRoute: deterministic.allowedRoute,
    deterministicCloudCalls: deterministic.cloudCallCount,
    restrictedDataLeakedByNaiveRouter: classification === "restricted" && naive.cloudCallCount > 0,
  });
}

const restricted = replayed.filter((r) => r.classification === "restricted");
const summary = {
  sourceEvidence: evidencePath.replace(root, ""),
  cases: replayed.length,
  restrictedCases: restricted.length,
  naiveRestrictedCloudCalls: restricted.reduce((n, r) => n + r.naiveCloudCalls, 0),
  deterministicRestrictedCloudCalls: restricted.reduce((n, r) => n + r.deterministicCloudCalls, 0),
  restrictedCasesLeakedByNaiveRouter: restricted.filter((r) => r.restrictedDataLeakedByNaiveRouter)
    .map((r) => r.caseId),
};

console.log(JSON.stringify(summary, null, 2));

const outPath = join(
  root,
  `outputs/naive-router-replay-${new Date().toISOString().slice(0, 10)}.json`,
);
await writeFile(
  outPath,
  JSON.stringify(
    {
      evidenceClass: "replay",
      note: "Deterministic replay of committed evidence through both routers. No inference ran.",
      summary,
      cases: replayed,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nwrote ${outPath}`);
