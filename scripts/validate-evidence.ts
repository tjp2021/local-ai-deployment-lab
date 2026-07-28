/**
 * Validate every committed evidence record against the result contract.
 *
 * The older validate-results script scanned outputs/raw/public/, a directory
 * that never existed, so it reported success without checking anything. A
 * green check that inspects nothing is worse than no check, because it reads
 * as coverage.
 *
 * This walks the records actually committed to outputs/ and validates the ones
 * that claim to be results. Native-generation records from a device runner are
 * a different, smaller contract and are checked for their required fields
 * rather than the full result schema.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateResult } from "../runner/validation.js";

const root = new URL("../", import.meta.url).pathname;
const outputs = join(root, "outputs");

const NATIVE_REQUIRED = [
  "schemaVersion",
  "requestId",
  "rawOutput",
  "timeToFirstTokenMs",
  "completionMs",
  "promptTokens",
  "generatedTokens",
  "tokensPerSecond",
];

const failures: string[] = [];
let resultRecords = 0;
let nativeRecords = 0;

const files = (await readdir(outputs)).filter((file) => file.endsWith(".json"));

for (const file of files) {
  const payload = JSON.parse(await readFile(join(outputs, file), "utf8")) as Record<string, any>;

  // Desktop sweeps and smoke runs wrap full result records under `records`.
  // Ingested device sweeps wrap them under `results`.
  const candidates: Array<Record<string, any>> = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.records)
      ? payload.records
      : [payload];

  for (const [index, record] of candidates.entries()) {
    const label = `${file}[${index}]`;

    // A native-generation record carries requestId and no evaluation block.
    if (record.requestId && !record.evaluation) {
      nativeRecords += 1;
      const missing = NATIVE_REQUIRED.filter((field) => !(field in record));
      if (missing.length > 0) failures.push(`${label}: native record missing ${missing.join(", ")}`);
      continue;
    }

    // Ingested device results intentionally omit runtime/device envelope fields,
    // which live once on the payload rather than on every record.
    if (!record.schemaVersion) continue;

    resultRecords += 1;
    const validation = validateResult(record);
    if (!validation.valid) failures.push(`${label}: ${validation.errors.join("; ")}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${files.length} evidence file(s): ${resultRecords} result record(s), ${nativeRecords} native-generation record(s).`,
  );
}
