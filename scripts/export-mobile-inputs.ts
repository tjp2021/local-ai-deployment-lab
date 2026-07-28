/**
 * Export the lab's prompts, cases, and output schema into the iOS QVAC runner.
 *
 * The runner is a separate Expo project and cannot import the lab's TypeScript
 * directly. Hand-copying fixtures into it would let the two drift, so the
 * inputs are generated instead and the generated file is gitignored.
 *
 * Run this before bundling or building the runner.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import modelOutputSchema from "../contracts/model-output.schema.json" with { type: "json" };
import type { IncidentCase } from "../contracts/types.js";
import { buildIncidentPrompt, PROMPT_TEMPLATE } from "../runner/prompt.js";

const root = new URL("../", import.meta.url).pathname;
const target = join(root, "platforms/ios-qvac/generated");

async function main(): Promise<void> {
  const cases = JSON.parse(
    await readFile(join(root, "sample-data/incidents.json"), "utf8"),
  ) as IncidentCase[];

  const payload = {
    generatedFrom: "sample-data/incidents.json",
    promptTemplate: PROMPT_TEMPLATE,
    modelOutputSchema,
    // Generation parameters must match the desktop baseline exactly, otherwise
    // device and desktop numbers are not comparable.
    generationParams: { temp: 0, seed: 42, predict: 256 },
    cases: cases.map((incidentCase) => {
      const prompt = buildIncidentPrompt(incidentCase);
      return {
        id: incidentCase.id,
        classification: incidentCase.classification,
        system: prompt.system,
        user: prompt.user,
      };
    }),
  };

  await mkdir(target, { recursive: true });
  await writeFile(join(target, "inputs.json"), JSON.stringify(payload, null, 2) + "\n");
  console.log(`wrote ${join(target, "inputs.json")} (${payload.cases.length} cases)`);
}

main().catch((error) => {
  console.error("export failed:", error);
  process.exitCode = 1;
});
