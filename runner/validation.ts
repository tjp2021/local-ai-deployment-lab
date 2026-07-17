import { readFile } from "node:fs/promises";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });

const caseSchema = JSON.parse(
  await readFile(new URL("../contracts/case.schema.json", import.meta.url), "utf8"),
);
const resultSchema = JSON.parse(
  await readFile(new URL("../contracts/result.schema.json", import.meta.url), "utf8"),
);
const modelOutputSchema = JSON.parse(
  await readFile(new URL("../contracts/model-output.schema.json", import.meta.url), "utf8"),
);

const validateCaseRecord = ajv.compile(caseSchema);
const validateResultRecord = ajv.compile(resultSchema);
const validateModelOutputRecord = ajv.compile(modelOutputSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath || "/";
    return `${path}: ${error.message ?? "invalid"}`;
  });
}

function runValidator(validator: ValidateFunction, value: unknown): ValidationResult {
  const valid = validator(value) as boolean;
  return {
    valid,
    errors: valid ? [] : formatErrors(validator.errors),
  };
}

export function validateCase(value: unknown): ValidationResult {
  return runValidator(validateCaseRecord, value);
}

export function validateResult(value: unknown): ValidationResult {
  return runValidator(validateResultRecord, value);
}

export function validateModelOutput(value: unknown): ValidationResult {
  return runValidator(validateModelOutputRecord, value);
}
