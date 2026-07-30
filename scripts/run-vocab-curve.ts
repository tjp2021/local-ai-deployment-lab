/**
 * Schema-complexity curve.
 *
 * The vocabulary experiment left two data points: free text held 18/18 and a
 * nineteen-value enum collapsed to 6/18. Two points describe a cliff but not
 * its shape. This sweep runs the same eighteen fixtures at enum sizes 0 (free
 * text), 2, 5, 10, 15, and 19, holding runtime, model, prompt, and generation
 * parameters constant, so the enum size is the only variable.
 *
 * For each condition the native json_schema constraint and the independent
 * validator use the same variant schema, so "valid" means the same thing on
 * both sides of the runtime boundary.
 *
 *   node --import tsx scripts/run-vocab-curve.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { totalmem } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { QvacAdapter } from "../adapters/qvac/qvac-adapter.js";
import type { IncidentCase } from "../contracts/types.js";
import type { RunContext } from "../runner/adapter.js";

const root = new URL("../", import.meta.url).pathname;
const ENUM_SIZES = [0, 2, 5, 10, 15, 19];

const baseSchema = JSON.parse(
  await readFile(join(root, "contracts/model-output.schema.json"), "utf8"),
) as Record<string, any>;
const vocabSchema = JSON.parse(
  await readFile(join(root, "contracts/experimental/model-output-1.1-vocabulary.schema.json"), "utf8"),
) as Record<string, any>;
const VOCABULARY: string[] = vocabSchema.properties.missingInformation.items.enum;
if (VOCABULARY.length !== 19) throw new Error(`Expected 19 vocabulary terms, found ${VOCABULARY.length}`);

const cases = JSON.parse(
  await readFile(join(root, "sample-data/incidents.json"), "utf8"),
) as IncidentCase[];

function variantSchema(enumSize: number): Record<string, any> {
  const schema = structuredClone(baseSchema);
  if (enumSize > 0) {
    // Mirrors the schema-1.1 construction exactly at enumSize 19.
    schema.properties.missingInformation = {
      type: "array",
      items: { enum: VOCABULARY.slice(0, enumSize) },
      uniqueItems: true,
    };
  }
  return schema;
}

function classifyFailure(record: Record<string, any>): string | null {
  if (record.evaluation?.schemaValid) return null;
  const parseError: string = record.generation?.parseError ?? "";
  if (/unexpected end|unterminated/i.test(parseError)) return "truncated_json";
  if (/duplicate items/i.test(parseError)) return "duplicate_items";
  if (/allowed values|enum/i.test(parseError)) return "off_vocabulary";
  return "other";
}

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

const stamp = new Date().toISOString().slice(0, 10);
const curve: Array<Record<string, any>> = [];
const allRecords: Array<Record<string, any>> = [];

for (const enumSize of ENUM_SIZES) {
  const schema = variantSchema(enumSize);
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validator = ajv.compile(schema);
  const validate = (value: unknown) => ({
    valid: validator(value) as boolean,
    errors: (validator.errors ?? []).map((e) => `${e.instancePath || "/"}: ${e.message ?? "invalid"}`),
  });

  console.log(`\n===== enum size ${enumSize} ${enumSize === 0 ? "(free text baseline)" : ""} =====`);
  const adapter = new QvacAdapter(undefined, { outputSchema: schema, validateOutput: validate });
  await adapter.load("cold");

  const records: Array<Record<string, any>> = [];
  for (const [index, incidentCase] of cases.entries()) {
    const runId = `qvac-desktop-${stamp}-vocab${enumSize}-${String(index + 1).padStart(3, "0")}`;
    const record = await adapter.generate(
      incidentCase,
      context(runId, index === 0 ? "cold" : "warm"),
    ) as Record<string, any>;
    records.push(record);
    const failure = classifyFailure(record);
    console.log(
      `${incidentCase.id}: valid=${record.evaluation?.schemaValid}` +
      (failure ? ` failure=${failure}` : "") +
      ` cloudCalls=${record.policy?.cloudCallCount}`,
    );
  }
  await adapter.unload();

  const failureModes: Record<string, number> = {};
  for (const record of records) {
    const failure = classifyFailure(record);
    if (failure) failureModes[failure] = (failureModes[failure] ?? 0) + 1;
  }
  const summary = {
    vocabularySize: enumSize,
    schemaValid: records.filter((r) => r.evaluation?.schemaValid).length,
    cases: records.length,
    policyGateHeld: records.filter((r) => r.policy?.passed).length,
    restrictedCloudCalls: records
      .filter((r) => r.policy?.classification === "restricted")
      .reduce((n, r) => n + (r.policy?.cloudCallCount ?? 0), 0),
    failureModes,
  };
  console.log("summary:", JSON.stringify(summary));
  curve.push(summary);
  allRecords.push(...records);
}

console.log("\n===== CURVE =====");
for (const point of curve) {
  console.log(
    `enum ${String(point.vocabularySize).padStart(2)}: ` +
    `${String(point.schemaValid).padStart(2)}/${point.cases} valid, ` +
    `gate ${point.policyGateHeld}/${point.cases}, ` +
    `failures ${JSON.stringify(point.failureModes)}`,
  );
}

const outPath = join(root, `outputs/qvac-desktop-macos-${stamp}-vocab-curve.json`);
await writeFile(
  outPath,
  JSON.stringify(
    {
      evidenceClass: "desktop",
      note: "Desktop host evidence. Not a physical-device claim.",
      experiment: {
        variable: "missingInformation enum size",
        constants: "runtime, model, quantization, prompt template, generation parameters, fixtures",
        enumSizes: ENUM_SIZES,
      },
      host: { totalMemoryGb: Math.round(totalmem() / 1e9) },
      curve,
      records: allRecords,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nwrote ${outPath}`);
