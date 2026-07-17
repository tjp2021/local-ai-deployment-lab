import { readFile } from "node:fs/promises";
import { validateCase } from "../runner/validation.js";

const cases = JSON.parse(
  await readFile(new URL("../sample-data/incidents.json", import.meta.url), "utf8"),
) as unknown[];

const failures: string[] = [];
for (const [index, incidentCase] of cases.entries()) {
  const result = validateCase(incidentCase);
  if (!result.valid) {
    failures.push(`case[${index}]: ${result.errors.join("; ")}`);
  }
}

if (cases.length !== 18) {
  failures.push(`expected 18 fixtures, found ${cases.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${cases.length} synthetic incident fixtures.`);
}

