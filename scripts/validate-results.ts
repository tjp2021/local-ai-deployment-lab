import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateResult } from "../runner/validation.js";

const outputDirectory = new URL("../outputs/raw/public/", import.meta.url);
let files: string[] = [];

try {
  files = (await readdir(outputDirectory)).filter((file) => file.endsWith(".json"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const failures: string[] = [];
for (const file of files) {
  const value = JSON.parse(await readFile(join(outputDirectory.pathname, file), "utf8"));
  const result = validateResult(value);
  if (!result.valid) {
    failures.push(`${file}: ${result.errors.join("; ")}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} public raw result record(s).`);
}

