import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const ignoredDirectories = new Set([".git", "node_modules", "models", "private"]);
const textExtensions = new Set([".json", ".md", ".ts", ".js", ".yaml", ".yml", ".txt"]);
const ignoredFiles = new Set(["scripts/check-scrub.ts"]);

const forbiddenPatterns = [
  { label: "absolute macOS home path", pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: "Apple device identifier", pattern: /000081[0-9A-Fa-f-]{10,}/ },
  { label: "private signing identity", pattern: /Apple Development:\s+[^\n]+/ },
  { label: "private key block", pattern: /BEGIN (?:RSA )?PRIVATE KEY/ },
  { label: "known private account string", pattern: /tyjoo21/i }
];

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (textExtensions.has(extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const findings: string[] = [];
for (const file of await collect(root.pathname)) {
  const localPath = relative(root.pathname, file);
  if (ignoredFiles.has(localPath)) continue;
  const content = await readFile(file, "utf8");
  for (const check of forbiddenPatterns) {
    if (check.pattern.test(content)) findings.push(`${localPath}: ${check.label}`);
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Scrub check passed: no configured private-path, device, signing, or key patterns found.");
}

