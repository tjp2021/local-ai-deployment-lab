/**
 * Reapply vendor patches after install.
 *
 * expo-modules-jsi 57.0.4 does not compile under Xcode 26.2 / Swift 6.2.3. One
 * expression in JavaScriptCodable+Date.swift is rejected as ambiguous, which
 * fails the whole iOS build. The patch adds explicit disambiguation and changes
 * no behavior.
 *
 * npm install silently reverts this, so it runs as a postinstall step. Patches
 * that already apply are skipped, so running twice is safe.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const patchDir = join(root, "patches");

let patches = [];
try {
  patches = readdirSync(patchDir).filter((file) => file.endsWith(".patch"));
} catch {
  console.log("no patches directory, nothing to apply");
  process.exit(0);
}

for (const patch of patches) {
  const path = join(patchDir, patch);
  // --dry-run first so an already-patched tree is reported, not re-applied.
  try {
    execFileSync("git", ["apply", "--check", path], { cwd: root, stdio: "pipe" });
  } catch {
    console.log(`${patch}: already applied or not applicable, skipping`);
    continue;
  }
  execFileSync("git", ["apply", path], { cwd: root, stdio: "inherit" });
  console.log(`${patch}: applied`);
}
